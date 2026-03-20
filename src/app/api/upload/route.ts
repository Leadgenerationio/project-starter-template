export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'
import * as XLSX from 'xlsx'

/** Column header aliases (lowercased) → canonical key */
const HEADER_MAP: Record<string, string> = {
  'date received': 'date_received',
  'datereceived': 'date_received',
  'date': 'date_received',
  'buyer': 'buyer',
  'firstname': 'first_name',
  'first name': 'first_name',
  'first_name': 'first_name',
  'forename': 'first_name',
  'lastname': 'last_name',
  'last name': 'last_name',
  'last_name': 'last_name',
  'surname': 'last_name',
  'telephone1': 'telephone',
  'telephone': 'telephone',
  'phone': 'telephone',
  'phone number': 'telephone',
  'tel': 'telephone',
  'mobile': 'telephone',
  'email': 'email',
  'email address': 'email',
  'postcode': 'postcode',
  'post code': 'postcode',
  'postal code': 'postcode',
  'zip': 'postcode',
  'zipcode': 'postcode',
  'sold 1': 'sold_1',
  'sold1': 'sold_1',
  'sold 2': 'sold_2',
  'sold2': 'sold_2',
  'sold 3': 'sold_3',
  'sold3': 'sold_3',
  'sold 4': 'sold_4',
  'sold4': 'sold_4',
  'column1': 'column1',
  'ever sold?': 'ever_sold',
  'ever sold': 'ever_sold',
  'eversold': 'ever_sold',
  'number of times sold': 'times_sold',
  'times sold': 'times_sold',
  'timessold': 'times_sold',
  'sold tag': 'sold_tag',
  'soldtag': 'sold_tag',
}

interface ParsedRow {
  date_received: string | null
  buyer: string | null
  first_name: string
  last_name: string
  telephone: string | null
  email: string | null
  postcode: string
  sold_1: string | null
  sold_2: string | null
  sold_3: string | null
  sold_4: string | null
  ever_sold: boolean
  times_sold: number
  sold_tag: string | null
}

function normalizeHeader(header: string): string | null {
  const key = header.toLowerCase().trim()
  return HEADER_MAP[key] ?? null
}

function cellToString(cell: unknown): string {
  if (cell === null || cell === undefined) return ''
  return String(cell).trim()
}

function normalizeBuyerName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

function isMeaningfulBuyer(val: string): boolean {
  if (!val) return false
  const lower = val.toLowerCase()
  return lower !== '0' && lower !== 'n/a' && lower !== 'none' && lower !== 'null' && lower !== ''
}

function parseDate(val: unknown): string | null {
  if (!val) return null
  if (val instanceof Date) {
    return val.toISOString().split('T')[0]
  }
  if (typeof val === 'number') {
    const date = XLSX.SSF.parse_date_code(val)
    if (date) {
      const y = date.y
      const m = String(date.m).padStart(2, '0')
      const d = String(date.d).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
  }
  const str = String(val).trim()
  if (!str) return null
  const parsed = new Date(str)
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0]
  }
  return null
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth

  // Accept JSON body with storage_path (file already uploaded to Supabase Storage by client)
  const body = await request.json()
  const { storage_path, product } = body

  if (!storage_path || typeof storage_path !== 'string') {
    return NextResponse.json({ error: 'storage_path is required' }, { status: 400 })
  }

  if (!product || typeof product !== 'string') {
    return NextResponse.json({ error: 'Product is required' }, { status: 400 })
  }

  // Download file from Supabase Storage
  const { data: fileData, error: downloadError } = await supabase.storage
    .from('imports')
    .download(storage_path)

  if (downloadError || !fileData) {
    console.error('Failed to download file:', downloadError?.message)
    return NextResponse.json({ error: 'Failed to download file from storage' }, { status: 500 })
  }

  const buffer = await fileData.arrayBuffer()

  // Parse file
  let rows: ParsedRow[]
  try {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

    if (rawRows.length === 0) {
      await supabase.storage.from('imports').remove([storage_path])
      return NextResponse.json({ error: 'File contains no data rows' }, { status: 400 })
    }

    // Map headers
    const sampleHeaders = Object.keys(rawRows[0])
    const headerMapping: Record<string, string> = {}
    for (const h of sampleHeaders) {
      const mapped = normalizeHeader(h)
      if (mapped) {
        headerMapping[h] = mapped
      }
    }

    // Validate required columns exist
    const mappedFields = new Set(Object.values(headerMapping))
    const requiredFields = ['first_name', 'last_name', 'postcode']
    const missing = requiredFields.filter((f) => !mappedFields.has(f))
    if (missing.length > 0) {
      await supabase.storage.from('imports').remove([storage_path])
      return NextResponse.json(
        { error: `Missing required columns: ${missing.join(', ')}. Check your file headers.` },
        { status: 400 }
      )
    }

    rows = rawRows.map((raw) => {
      const mapped: Record<string, unknown> = {}
      for (const [origHeader, canonicalKey] of Object.entries(headerMapping)) {
        mapped[canonicalKey] = raw[origHeader]
      }

      return {
        date_received: parseDate(mapped.date_received),
        buyer: cellToString(mapped.buyer) || null,
        first_name: cellToString(mapped.first_name),
        last_name: cellToString(mapped.last_name),
        telephone: cellToString(mapped.telephone) || null,
        email: cellToString(mapped.email) || null,
        postcode: cellToString(mapped.postcode),
        sold_1: cellToString(mapped.sold_1) || null,
        sold_2: cellToString(mapped.sold_2) || null,
        sold_3: cellToString(mapped.sold_3) || null,
        sold_4: cellToString(mapped.sold_4) || null,
        ever_sold: ['1', 'true', 'yes', 'y'].includes(cellToString(mapped.ever_sold).toLowerCase()),
        times_sold: parseInt(cellToString(mapped.times_sold), 10) || 0,
        sold_tag: cellToString(mapped.sold_tag) || null,
      }
    })
  } catch {
    await supabase.storage.from('imports').remove([storage_path])
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 400 })
  }

  // ===== Step 2: Extract and deduplicate buyers =====
  const buyerNamesSet = new Map<string, string>()
  for (const row of rows) {
    const buyerColumns = [row.buyer, row.sold_1, row.sold_2, row.sold_3, row.sold_4]
    for (const val of buyerColumns) {
      if (val && isMeaningfulBuyer(val)) {
        const display = normalizeBuyerName(val)
        const key = display.toLowerCase()
        if (!buyerNamesSet.has(key)) {
          buyerNamesSet.set(key, display)
        }
      }
    }
  }

  const allBuyerNames = Array.from(buyerNamesSet.values())
  let existingBuyersCount = 0
  let newBuyersCount = 0
  const buyerIdMap = new Map<string, string>()

  if (allBuyerNames.length > 0) {
    const { data: existingBuyers } = await supabase
      .from('buyers')
      .select('id, company_name')
      .eq('org_id', orgId)

    if (existingBuyers) {
      for (const b of existingBuyers) {
        buyerIdMap.set(b.company_name.toLowerCase(), b.id)
      }
    }

    const newNames = allBuyerNames.filter((name) => !buyerIdMap.has(name.toLowerCase()))
    existingBuyersCount = allBuyerNames.length - newNames.length

    if (newNames.length > 0) {
      const newBuyerRecords = newNames.map((name) => ({
        org_id: orgId,
        company_name: name,
        contact_name: name,
        email: `${name.toLowerCase().replace(/[^a-z0-9]/g, '')}@imported.local`,
        is_active: true,
      }))

      const BATCH_SIZE = 200
      for (let i = 0; i < newBuyerRecords.length; i += BATCH_SIZE) {
        const batch = newBuyerRecords.slice(i, i + BATCH_SIZE)
        const { data: created, error: buyerError } = await supabase
          .from('buyers')
          .insert(batch)
          .select('id, company_name')

        if (buyerError) {
          console.error('Failed to create buyers:', buyerError.message)
          return NextResponse.json({ error: 'Failed to create buyer records' }, { status: 500 })
        }

        if (created) {
          for (const b of created) {
            buyerIdMap.set(b.company_name.toLowerCase(), b.id)
          }
        }
      }
      newBuyersCount = newNames.length
    }
  }

  // ===== Step 3: Import leads (dedup on email or phone) =====
  const existingLeadsByEmail = new Map<string, string>()
  const existingLeadsByPhone = new Map<string, string>()

  const { data: existingLeads } = await supabase
    .from('leads')
    .select('id, email, phone')
    .eq('org_id', orgId)

  if (existingLeads) {
    for (const lead of existingLeads) {
      if (lead.email) existingLeadsByEmail.set(lead.email.toLowerCase(), lead.id)
      if (lead.phone) existingLeadsByPhone.set(lead.phone.replace(/\s+/g, ''), lead.id)
    }
  }

  let leadsImported = 0
  let leadsUpdated = 0
  let salesRecorded = 0
  let duplicateSalesSkipped = 0

  const batchEmails = new Map<string, string>()
  const batchPhones = new Map<string, string>()

  const existingSalesSet = new Set<string>()
  const { data: existingSales } = await supabase
    .from('lead_sales')
    .select('lead_id, buyer_id')
    .eq('org_id', orgId)

  if (existingSales) {
    for (const sale of existingSales) {
      existingSalesSet.add(`${sale.lead_id}:${sale.buyer_id}`)
    }
  }

  const leadsToInsert: Record<string, unknown>[] = []
  const leadsToUpdate: { id: string; data: Record<string, unknown> }[] = []
  const pendingSalesByIndex: Map<number, string[]> = new Map()
  const pendingSalesByLeadId: Map<string, string[]> = new Map()

  for (const row of rows) {
    if (!row.first_name && !row.last_name) continue

    const email = row.email?.toLowerCase() || null
    const phone = row.telephone?.replace(/\s+/g, '') || null
    const originalBuyerId = row.buyer && isMeaningfulBuyer(row.buyer)
      ? buyerIdMap.get(normalizeBuyerName(row.buyer).toLowerCase()) ?? null
      : null

    let existingLeadId: string | null = null
    if (email && existingLeadsByEmail.has(email)) {
      existingLeadId = existingLeadsByEmail.get(email)!
    } else if (phone && existingLeadsByPhone.has(phone)) {
      existingLeadId = existingLeadsByPhone.get(phone)!
    }

    if (!existingLeadId && email && batchEmails.has(email)) {
      existingLeadId = batchEmails.get(email)!
    }
    if (!existingLeadId && phone && batchPhones.has(phone)) {
      existingLeadId = batchPhones.get(phone)!
    }

    const soldBuyerIds: string[] = []
    for (const soldName of [row.sold_1, row.sold_2, row.sold_3, row.sold_4]) {
      if (soldName && isMeaningfulBuyer(soldName)) {
        const buyerId = buyerIdMap.get(normalizeBuyerName(soldName).toLowerCase())
        if (buyerId) soldBuyerIds.push(buyerId)
      }
    }

    const leadData: Record<string, unknown> = {
      first_name: row.first_name,
      last_name: row.last_name,
      email: row.email || `noemail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@placeholder.local`,
      phone: row.telephone,
      postcode: row.postcode || 'N/A',
      product,
      source: 'Other',
      date_received: row.date_received,
      ever_sold: row.ever_sold,
      times_sold: row.times_sold,
      sold_tag: row.sold_tag,
      original_buyer_id: originalBuyerId,
    }

    if (existingLeadId) {
      leadsToUpdate.push({ id: existingLeadId, data: leadData })
      if (soldBuyerIds.length > 0) {
        pendingSalesByLeadId.set(existingLeadId, soldBuyerIds)
      }
    } else {
      const insertIndex = leadsToInsert.length
      leadsToInsert.push({ ...leadData, org_id: orgId, status: row.ever_sold ? 'resold' : 'new' })

      if (email) batchEmails.set(email, `__pending_${insertIndex}`)
      if (phone) batchPhones.set(phone, `__pending_${insertIndex}`)

      if (soldBuyerIds.length > 0) {
        pendingSalesByIndex.set(insertIndex, soldBuyerIds)
      }
    }
  }

  // Batch insert new leads
  const insertedLeadIds: string[] = []
  const LEAD_BATCH_SIZE = 200
  for (let i = 0; i < leadsToInsert.length; i += LEAD_BATCH_SIZE) {
    const batch = leadsToInsert.slice(i, i + LEAD_BATCH_SIZE)
    const { data: inserted, error: insertError } = await supabase
      .from('leads')
      .insert(batch)
      .select('id')

    if (insertError) {
      console.error('Failed to insert leads:', insertError.message)
      return NextResponse.json({ error: 'Failed to import leads' }, { status: 500 })
    }

    if (inserted) {
      for (const lead of inserted) {
        insertedLeadIds.push(lead.id)
      }
    }
  }
  leadsImported = insertedLeadIds.length

  // Batch update existing leads
  for (const update of leadsToUpdate) {
    const { error: updateError } = await supabase
      .from('leads')
      .update(update.data)
      .eq('id', update.id)
      .eq('org_id', orgId)

    if (!updateError) leadsUpdated++
  }

  // ===== Step 4: Record sales =====
  const salesToInsert: Record<string, unknown>[] = []

  for (const [insertIndex, buyerIds] of pendingSalesByIndex) {
    const leadId = insertedLeadIds[insertIndex]
    if (!leadId) continue
    for (const buyerId of buyerIds) {
      const key = `${leadId}:${buyerId}`
      if (existingSalesSet.has(key)) {
        duplicateSalesSkipped++
      } else {
        salesToInsert.push({
          org_id: orgId,
          lead_id: leadId,
          buyer_id: buyerId,
          sale_type: 'original',
          price: 0,
          order_id: null,
        })
        existingSalesSet.add(key)
      }
    }
  }

  for (const [leadId, buyerIds] of pendingSalesByLeadId) {
    for (const buyerId of buyerIds) {
      const key = `${leadId}:${buyerId}`
      if (existingSalesSet.has(key)) {
        duplicateSalesSkipped++
      } else {
        salesToInsert.push({
          org_id: orgId,
          lead_id: leadId,
          buyer_id: buyerId,
          sale_type: 'original',
          price: 0,
          order_id: null,
        })
        existingSalesSet.add(key)
      }
    }
  }

  for (let i = 0; i < salesToInsert.length; i += LEAD_BATCH_SIZE) {
    const batch = salesToInsert.slice(i, i + LEAD_BATCH_SIZE)
    const { error: salesError } = await supabase
      .from('lead_sales')
      .insert(batch)

    if (salesError) {
      console.error('Failed to insert sales:', salesError.message)
    } else {
      salesRecorded += batch.length
    }
  }

  // Clean up storage file
  await supabase.storage.from('imports').remove([storage_path])

  // ===== Step 5: Return summary =====
  return NextResponse.json({
    newBuyers: newBuyersCount,
    existingBuyers: existingBuyersCount,
    leadsImported,
    leadsUpdated,
    salesRecorded,
    duplicateSalesSkipped,
    totalRows: rows.length,
  })
}
