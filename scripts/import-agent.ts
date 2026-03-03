import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const PRODUCTS = [
  'Solar Panels', 'Insulation', 'Windows & Doors',
]

const SOURCES = ['Website', 'Referral', 'Cold Call', 'Social Media', 'Email Campaign', 'Partner', 'Event', 'Other']

const HEADER_MAP: Record<string, string> = {
  'first name': 'first_name', 'firstname': 'first_name', 'first_name': 'first_name',
  'last name': 'last_name', 'lastname': 'last_name', 'last_name': 'last_name',
  'email': 'email', 'email address': 'email',
  'phone': 'phone', 'telephone': 'phone', 'phone number': 'phone',
  'postcode': 'postcode', 'post code': 'postcode', 'zip': 'postcode', 'zip code': 'postcode',
  'product': 'product', 'product type': 'product',
  'source': 'source', 'lead source': 'source',
  'buyer': 'buyer', 'buyer name': 'buyer', 'buyer_name': 'buyer',
  'company': 'buyer', 'company name': 'buyer', 'company_name': 'buyer',
}

const BATCH_SIZE = 50
const PROGRESS_INTERVAL = 10

async function processJob(jobId: string) {
  console.log(`Processing job ${jobId}`)

  // Mark as processing
  await supabase.from('import_jobs').update({ status: 'processing' }).eq('id', jobId)

  const { data: job } = await supabase.from('import_jobs').select('*').eq('id', jobId).single()
  if (!job) return

  // Download file from storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('imports')
    .download(job.storage_path)

  if (downloadError || !fileData) {
    await supabase.from('import_jobs').update({
      status: 'failed',
      errors: [{ row: 0, field: 'file', message: 'Failed to download file' }],
    }).eq('id', jobId)
    return
  }

  // Parse Excel
  const buffer = await fileData.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

  // Build reverse mapping from column_mapping if present (csvHeader → fieldKey)
  const FIXED_PREFIX = '__fixed__:'
  const columnMapping: Record<string, string> | null = job.column_mapping
  const reverseMap: Record<string, string> = {}
  const fixedValues: Record<string, string> = {}
  if (columnMapping) {
    for (const [fieldKey, value] of Object.entries(columnMapping)) {
      if (value.startsWith(FIXED_PREFIX)) {
        fixedValues[fieldKey] = value.slice(FIXED_PREFIX.length)
      } else if (value) {
        reverseMap[value] = fieldKey
      }
    }
  }

  const totalRows = rawData.length
  await supabase.from('import_jobs').update({ total_rows: totalRows }).eq('id', jobId)

  // Pre-map all rows to extract buyer names for auto-creation
  const allMapped: Record<string, string>[] = rawData.map((row) => {
    const mapped: Record<string, string> = {}
    if (columnMapping) {
      Object.assign(mapped, fixedValues)
      for (const [key, value] of Object.entries(row)) {
        const targetField = reverseMap[key]
        if (targetField) mapped[targetField] = String(value ?? '').trim()
      }
    } else {
      for (const [key, value] of Object.entries(row)) {
        const normalizedKey = key.toLowerCase().trim()
        const mappedKey = HEADER_MAP[normalizedKey] || normalizedKey
        mapped[mappedKey] = String(value ?? '').trim()
      }
    }
    return mapped
  })

  // Auto-create buyers from mapped buyer column
  const buyerIdMap = new Map<string, string>()
  const buyerNames = new Set<string>()
  for (const m of allMapped) {
    if (m.buyer?.trim()) buyerNames.add(m.buyer.trim())
  }
  if (buyerNames.size > 0) {
    const { data: existingBuyers } = await supabase
      .from('buyers')
      .select('id, company_name')
      .eq('org_id', job.org_id)
      .in('company_name', Array.from(buyerNames))
    if (existingBuyers) {
      for (const b of existingBuyers) buyerIdMap.set(b.company_name, b.id)
    }
    const missingNames = Array.from(buyerNames).filter((n) => !buyerIdMap.has(n))
    if (missingNames.length > 0) {
      const newBuyers = missingNames.map((name) => ({
        org_id: job.org_id,
        company_name: name,
        contact_name: name,
        email: `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@imported.local`,
        is_active: true,
      }))
      const { data: created } = await supabase.from('buyers').insert(newBuyers).select('id, company_name')
      if (created) {
        for (const b of created) buyerIdMap.set(b.company_name, b.id)
      }
    }
    console.log(`Buyers: ${buyerIdMap.size} total (${buyerNames.size - buyerIdMap.size} failed to create)`)
  }

  let successCount = 0
  let errorCount = 0
  const errors: { row: number; field: string; message: string }[] = []
  const batch: Record<string, unknown>[] = []

  for (let i = 0; i < allMapped.length; i++) {
    const mapped = allMapped[i]

    // Validate
    let valid = true
    if (!mapped.first_name) { errors.push({ row: i + 2, field: 'first_name', message: 'Required' }); valid = false }
    if (!mapped.last_name) { errors.push({ row: i + 2, field: 'last_name', message: 'Required' }); valid = false }
    if (!mapped.email || !mapped.email.includes('@')) { errors.push({ row: i + 2, field: 'email', message: 'Invalid email' }); valid = false }
    if (!mapped.postcode || mapped.postcode.length < 2) { errors.push({ row: i + 2, field: 'postcode', message: 'Required' }); valid = false }
    if (!mapped.product || !PRODUCTS.includes(mapped.product)) { errors.push({ row: i + 2, field: 'product', message: `Invalid product. Valid: ${PRODUCTS.join(', ')}` }); valid = false }

    if (!valid) {
      errorCount++
    } else {
      const buyerName = mapped.buyer?.trim()
      batch.push({
        org_id: job.org_id,
        first_name: mapped.first_name,
        last_name: mapped.last_name,
        email: mapped.email,
        phone: mapped.phone || null,
        postcode: mapped.postcode,
        product: mapped.product,
        source: SOURCES.includes(mapped.source) ? mapped.source : 'Website',
        original_buyer_id: (buyerName && buyerIdMap.get(buyerName)) || null,
      })
    }

    // Insert batch
    if (batch.length >= BATCH_SIZE || i === rawData.length - 1) {
      if (batch.length > 0) {
        const { error: insertError } = await supabase.from('leads').insert(batch)
        if (insertError) {
          errorCount += batch.length
          errors.push({ row: i + 2, field: 'batch', message: insertError.message })
        } else {
          successCount += batch.length
        }
        batch.length = 0
      }
    }

    // Update progress
    if ((i + 1) % PROGRESS_INTERVAL === 0 || i === rawData.length - 1) {
      await supabase.from('import_jobs').update({
        processed_rows: i + 1,
        success_count: successCount,
        error_count: errorCount,
        errors: errors.slice(0, 100), // Cap stored errors
      }).eq('id', jobId)
    }
  }

  // Mark complete
  await supabase.from('import_jobs').update({
    status: errorCount === totalRows ? 'failed' : 'completed',
    processed_rows: totalRows,
    success_count: successCount,
    error_count: errorCount,
    errors: errors.slice(0, 100),
  }).eq('id', jobId)

  // Clean up storage file after processing
  await supabase.storage.from('imports').remove([job.storage_path])

  // Create notification
  await supabase.from('notifications').insert({
    org_id: job.org_id,
    user_id: job.user_id,
    type: 'import_complete',
    title: 'Import Complete',
    message: `Imported ${successCount} of ${totalRows} leads from ${job.filename}${errorCount > 0 ? ` (${errorCount} errors)` : ''}.`,
  })

  console.log(`Job ${jobId} complete: ${successCount} success, ${errorCount} errors`)
}

async function poll() {
  console.log('Import Agent started. Polling for pending jobs...')

  while (true) {
    const { data: jobs } = await supabase
      .from('import_jobs')
      .select('id')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1)

    if (jobs && jobs.length > 0) {
      await processJob(jobs[0].id)
    }

    // Wait 5 seconds before next poll
    await new Promise((resolve) => setTimeout(resolve, 5000))
  }
}

poll().catch(console.error)
