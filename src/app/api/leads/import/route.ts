export const maxDuration = 60 // Allow up to 60s for large inline imports

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'
import { createClient } from '@/lib/supabase/server'
import { INLINE_IMPORT_THRESHOLD, IMPORT_BATCH_SIZE, MAX_IMPORT_FILE_SIZE } from '@/lib/constants'
import { parseExcelBuffer, applyColumnMapping } from '@/lib/utils/excel-parser'
import { importRowSchema } from '@/lib/validations/import'
import { columnMappingImportSchema } from '@/lib/validations/column-mapping'
import type { ImportError, ColumnMapping } from '@/lib/types'
import type { ParsedRow } from '@/lib/utils/excel-parser'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId, user } = auth

  const contentType = request.headers.get('content-type') || ''

  // JSON path: file already uploaded via preview, column mapping provided
  if (contentType.includes('application/json')) {
    return handleMappedImport(request, supabase, orgId, user.id)
  }

  // FormData path: legacy direct upload (backwards compatible)
  return handleFormDataImport(request, supabase, orgId, user.id)
}

async function handleMappedImport(
  request: NextRequest,
  supabase: SupabaseClient,
  orgId: string,
  userId: string
) {
  const body = await request.json()
  const parsed = columnMappingImportSchema.safeParse(body)

  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: issue.message }, { status: 400 })
  }

  const { storage_path, filename, column_mapping, buyer_id } = parsed.data

  // Download file from storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('imports')
    .download(storage_path)

  if (downloadError || !fileData) {
    return NextResponse.json({ error: 'Failed to download file from storage' }, { status: 500 })
  }

  const buffer = await fileData.arrayBuffer()

  let rows: ParsedRow[]
  try {
    rows = applyColumnMapping(buffer, column_mapping)
  } catch {
    return NextResponse.json({ error: 'Failed to parse file with mapping' }, { status: 400 })
  }

  // Small files: process inline
  if (rows.length <= INLINE_IMPORT_THRESHOLD) {
    try {
      return await processInline(supabase, orgId, userId, filename, rows, column_mapping, buyer_id ?? undefined)
    } finally {
      // Always clean up storage file after inline processing, even on failure
      await supabase.storage.from('imports').remove([storage_path])
    }
  }

  // Large files: create a pending job for the background agent
  const largeJobRecord: Record<string, unknown> = {
    org_id: orgId,
    user_id: userId,
    filename,
    storage_path,
    status: 'pending',
    total_rows: rows.length,
    column_mapping,
  }

  let { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .insert(largeJobRecord)
    .select()
    .single()

  // Retry without column_mapping if column doesn't exist yet
  if (jobError?.message?.includes('column_mapping')) {
    delete largeJobRecord.column_mapping
    const retry = await supabase.from('import_jobs').insert(largeJobRecord).select().single()
    job = retry.data
    jobError = retry.error
  }

  if (jobError) {
    return NextResponse.json({ error: 'Failed to create import job' }, { status: 500 })
  }

  return NextResponse.json(job, { status: 201 })
}

async function handleFormDataImport(
  request: NextRequest,
  supabase: SupabaseClient,
  orgId: string,
  userId: string
) {
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

  let rows
  try {
    rows = parseExcelBuffer(buffer)
  } catch {
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 400 })
  }

  // Small files: process inline without background agent
  if (rows.length <= INLINE_IMPORT_THRESHOLD) {
    return processInline(supabase, orgId, userId, file.name, rows)
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
      user_id: userId,
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
  rows: ParsedRow[],
  columnMapping?: ColumnMapping,
  buyerId?: string
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
        original_buyer_id: buyerId ?? null,
      })
    }
  }

  // Batch insert valid leads in chunks
  if (validLeads.length > 0) {
    for (let i = 0; i < validLeads.length; i += IMPORT_BATCH_SIZE) {
      const batch = validLeads.slice(i, i + IMPORT_BATCH_SIZE)
      const { error: insertError } = await supabase
        .from('leads')
        .insert(batch)

      if (insertError) {
        return NextResponse.json(
          { error: `Failed to insert leads (batch ${Math.floor(i / IMPORT_BATCH_SIZE) + 1}): ${insertError.message}` },
          { status: 500 }
        )
      }
    }
  }

  // Create a completed job record so the UI can show results
  const jobRecord: Record<string, unknown> = {
    org_id: orgId,
    user_id: userId,
    filename,
    storage_path: 'inline',
    status: 'completed',
    total_rows: rows.length,
    processed_rows: rows.length,
    success_count: validLeads.length,
    error_count: errors.length,
    errors: errors.length > 0 ? errors : null,
  }
  if (columnMapping) jobRecord.column_mapping = columnMapping

  let { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .insert(jobRecord)
    .select()
    .single()

  // Retry without column_mapping if column doesn't exist yet (migration not applied)
  if (jobError?.message?.includes('column_mapping')) {
    delete jobRecord.column_mapping
    const retry = await supabase.from('import_jobs').insert(jobRecord).select().single()
    job = retry.data
    jobError = retry.error
  }

  if (jobError) {
    return NextResponse.json({ error: 'Leads imported but failed to create job record' }, { status: 500 })
  }

  return NextResponse.json(job, { status: 201 })
}
