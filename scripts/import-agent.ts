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

/** Status markers in buyer columns — cell says "Sold" but the buyer is the column header */
const BUYER_STATUS_MARKERS = new Set(['sold', 'yes', 'y', '1', 'true', 'x'])

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
        if (targetField) {
          mapped[targetField] = String(value ?? '').trim()
        }
      }
    } else {
      for (const [key, value] of Object.entries(row)) {
        const normalizedKey = key.toLowerCase().trim()
        const mappedKey = HEADER_MAP[normalizedKey] || normalizedKey
        mapped[mappedKey] = String(value ?? '').trim()
      }
    }
    // Auto-detect buyer: scan unmapped columns for status markers like "Sold"
    // The column header IS the buyer name (supports multiple buyer columns)
    if (!mapped.buyer) {
      for (const [key, value] of Object.entries(row)) {
        if (columnMapping ? reverseMap[key] : HEADER_MAP[key.toLowerCase().trim()]) continue
        const cellValue = String(value ?? '').trim()
        if (cellValue && BUYER_STATUS_MARKERS.has(cellValue.toLowerCase())) {
          mapped.buyer = key
          break
        }
      }
    }
    return mapped
  })

  // --- Deduplication: load existing phone numbers from last 30 days ---
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const existingPhones = new Set<string>()
  let phonePage = 0
  const PHONE_PAGE_SIZE = 1000
  while (true) {
    const { data: phoneBatch } = await supabase
      .from('leads')
      .select('phone')
      .eq('org_id', job.org_id)
      .gte('created_at', thirtyDaysAgo)
      .not('phone', 'is', null)
      .range(phonePage * PHONE_PAGE_SIZE, (phonePage + 1) * PHONE_PAGE_SIZE - 1)
    if (!phoneBatch || phoneBatch.length === 0) break
    for (const lead of phoneBatch) {
      if (lead.phone) existingPhones.add(lead.phone.replace(/\s+/g, ''))
    }
    if (phoneBatch.length < PHONE_PAGE_SIZE) break
    phonePage++
  }
  console.log(`Loaded ${existingPhones.size} existing phones for dedup`)
  let duplicateCount = 0
  const errors: { row: number; field: string; message: string }[] = []

  // --- Auto-create buyers from mapped buyer column ---
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
      const { data: created, error: buyerError } = await supabase.from('buyers').insert(newBuyers).select('id, company_name')
      if (buyerError) {
        console.error(`Failed to create buyers: ${buyerError.message}`)
        errors.push({ row: 0, field: 'buyer', message: `Failed to create buyers: ${buyerError.message}` })
      }
      if (created) {
        for (const b of created) buyerIdMap.set(b.company_name, b.id)
      }
    }
    console.log(`Buyers: ${buyerIdMap.size} resolved, ${missingNames.length} new`)
  }

  // Determine lead status from job metadata (lead_age stored in column_mapping meta)
  const leadAge = (job as Record<string, unknown>).lead_age as string | undefined
  const isEligible = leadAge === 'eligible'
  const eligibleDate = isEligible
    ? new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString()
    : undefined

  let successCount = 0
  let errorCount = 0
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
    } else if (mapped.phone && existingPhones.has(mapped.phone.replace(/\s+/g, ''))) {
      // Dedup: skip duplicate phone number
      duplicateCount++
    } else {
      if (mapped.phone) existingPhones.add(mapped.phone.replace(/\s+/g, ''))
      const buyerName = mapped.buyer?.trim()
      const lead: Record<string, unknown> = {
        org_id: job.org_id,
        first_name: mapped.first_name,
        last_name: mapped.last_name,
        email: mapped.email,
        phone: mapped.phone || null,
        postcode: mapped.postcode,
        product: mapped.product,
        source: SOURCES.includes(mapped.source) ? mapped.source : 'Website',
        status: isEligible ? 'eligible' : 'new',
        original_buyer_id: (buyerName && buyerIdMap.get(buyerName)) || null,
      }
      if (eligibleDate) lead.created_at = eligibleDate
      batch.push(lead)
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

  // Add duplicate info to errors list
  if (duplicateCount > 0) {
    errors.push({ row: 0, field: 'phone', message: `${duplicateCount} duplicate leads skipped (phone number already imported in last 30 days)` })
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
  const parts = [`Imported ${successCount} of ${totalRows} leads from ${job.filename}`]
  if (duplicateCount > 0) parts.push(`${duplicateCount} duplicates skipped`)
  if (errorCount > 0) parts.push(`${errorCount} errors`)
  await supabase.from('notifications').insert({
    org_id: job.org_id,
    user_id: job.user_id,
    type: 'import_complete',
    title: 'Import Complete',
    message: parts.join('. ') + '.',
  })

  console.log(`Job ${jobId} complete: ${successCount} success, ${duplicateCount} dupes, ${errorCount} errors`)
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
