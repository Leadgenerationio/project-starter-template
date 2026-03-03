import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'
import { MAX_IMPORT_FILE_SIZE } from '@/lib/constants'
import { parseExcelHeaders, suggestMapping } from '@/lib/utils/excel-parser'
import type { PreviewResponse } from '@/lib/types'

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth

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

  let parsed
  try {
    parsed = parseExcelHeaders(buffer)
  } catch {
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 400 })
  }

  if (parsed.totalRows === 0) {
    return NextResponse.json({ error: 'File contains no data rows' }, { status: 400 })
  }

  // Upload to storage for later processing
  const storagePath = `${orgId}/${Date.now()}-${file.name}`
  const { error: uploadError } = await supabase.storage
    .from('imports')
    .upload(storagePath, buffer, { contentType: file.type })

  if (uploadError) {
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }

  const suggested = suggestMapping(parsed.headers)

  const response: PreviewResponse = {
    storage_path: storagePath,
    filename: file.name,
    headers: parsed.headers,
    sample_rows: parsed.sampleRows,
    suggested_mapping: suggested,
    total_rows: parsed.totalRows,
  }

  return NextResponse.json(response)
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase } = auth

  const { storage_path } = await request.json()
  if (!storage_path || typeof storage_path !== 'string') {
    return NextResponse.json({ error: 'storage_path is required' }, { status: 400 })
  }

  await supabase.storage.from('imports').remove([storage_path])

  return NextResponse.json({ ok: true })
}
