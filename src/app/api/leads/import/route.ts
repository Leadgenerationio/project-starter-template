import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import { MAX_IMPORT_FILE_SIZE, INLINE_IMPORT_THRESHOLD } from '@/lib/constants'
import { parseExcelBuffer } from '@/lib/utils/excel-parser'
import { importRowSchema } from '@/lib/validations/import'
import type { ImportError } from '@/lib/types'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId, user } = auth

  const formData = await request.formData()
  const file = formData.get('file') as File

  if (!file) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
  }

  if (file.size > MAX_IMPORT_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 })
  }

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
    return NextResponse.json({ error: 'Invalid file type. Supported: .xlsx, .xls, .csv' }, { status: 400 })
  }

  const buffer = await file.arrayBuffer()

  // Parse to check row count for inline processing
  let rows
  try {
    rows = parseExcelBuffer(buffer)
  } catch {
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 400 })
  }

  // Small files: process inline without background agent
  if (rows.length <= INLINE_IMPORT_THRESHOLD) {
    return processInline(supabase, orgId, user.id, file.name, rows)
  }

  // Large files: upload to storage and create a pending job for the background agent
  const storagePath = `${orgId}/${Date.now()}-${file.name}`

  const { error: uploadError } = await supabase.storage
    .from('imports')
    .upload(storagePath, buffer, { contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }

  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .insert({
      org_id: orgId,
      user_id: user.id,
      filename: file.name,
      storage_path: storagePath,
      status: 'pending',
      total_rows: rows.length,
    })
    .select()
    .single()

  if (jobError) {
    await supabase.storage.from('imports').remove([storagePath])
    return NextResponse.json({ error: 'Failed to create import job' }, { status: 500 })
  }

  return NextResponse.json(job, { status: 201 })
}

async function processInline(
  supabase: SupabaseClient,
  orgId: string,
  userId: string,
  filename: string,
  rows: ReturnType<typeof parseExcelBuffer>
) {
  const errors: ImportError[] = []
  const validLeads: Record<string, unknown>[] = []

  for (let i = 0; i < rows.length; i++) {
    const result = importRowSchema.safeParse(rows[i])
    if (!result.success) {
      const issue = result.error.issues[0]
      errors.push({ row: i + 2, field: String(issue.path[0] ?? ''), message: issue.message })
    } else {
      validLeads.push({
        org_id: orgId,
        first_name: result.data.first_name,
        last_name: result.data.last_name,
        email: result.data.email,
        phone: result.data.phone ?? null,
        postcode: result.data.postcode,
        product: result.data.product,
        source: result.data.source ?? 'Website',
        status: 'new',
      })
    }
  }

  // Batch insert valid leads
  if (validLeads.length > 0) {
    const { error: insertError } = await supabase
      .from('leads')
      .insert(validLeads)

    if (insertError) {
      return NextResponse.json({ error: 'Failed to insert leads' }, { status: 500 })
    }
  }

  // Create a completed job record so the UI can show results
  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .insert({
      org_id: orgId,
      user_id: userId,
      filename,
      status: 'completed',
      total_rows: rows.length,
      processed_rows: rows.length,
      success_count: validLeads.length,
      error_count: errors.length,
      errors: errors.length > 0 ? errors : null,
    })
    .select()
    .single()

  if (jobError) {
    return NextResponse.json({ error: 'Leads imported but failed to create job record' }, { status: 500 })
  }

  return NextResponse.json(job, { status: 201 })
}
