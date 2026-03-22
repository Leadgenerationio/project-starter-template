import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrgByApiKey } from '@/lib/supabase/api-key-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { ingestLeadSchema, ingestRequestSchema } from '@/lib/validations/ingest'
import type { IngestLeadInput } from '@/lib/validations/ingest'

const BATCH_SIZE = 200

export async function POST(request: NextRequest) {
  // Authenticate via API key
  const auth = await getAuthenticatedOrgByApiKey(request)
  if ('error' in auth) return auth.error

  const { orgId } = auth

  // Parse body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = ingestRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({
      error: 'Validation failed',
      details: parsed.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      })),
    }, { status: 400 })
  }

  const isSingle = !Array.isArray(body)
  const leads: IngestLeadInput[] = Array.isArray(parsed.data) ? parsed.data : [parsed.data]

  const supabase = createAdminClient()

  // --- Phone dedup: load existing phones from last 30 days ---
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const existingPhones = new Set<string>()
  let phonePage = 0
  const PAGE_SIZE = 1000

  while (true) {
    const { data: phoneBatch } = await supabase
      .from('leads')
      .select('phone')
      .eq('org_id', orgId)
      .gte('created_at', thirtyDaysAgo)
      .not('phone', 'is', null)
      .range(phonePage * PAGE_SIZE, (phonePage + 1) * PAGE_SIZE - 1)

    if (!phoneBatch || phoneBatch.length === 0) break
    for (const row of phoneBatch) {
      if (row.phone) existingPhones.add(row.phone.replace(/\s+/g, ''))
    }
    if (phoneBatch.length < PAGE_SIZE) break
    phonePage++
  }

  // --- Buyer auto-match ---
  const buyerNames = new Set<string>()
  for (const lead of leads) {
    if (lead.buyer?.trim()) buyerNames.add(lead.buyer.trim())
  }

  const buyerIdMap = new Map<string, string>()
  if (buyerNames.size > 0) {
    const { data: existingBuyers } = await supabase
      .from('buyers')
      .select('id, company_name')
      .eq('org_id', orgId)
      .in('company_name', Array.from(buyerNames))

    if (existingBuyers) {
      for (const b of existingBuyers) buyerIdMap.set(b.company_name, b.id)
    }
  }

  // --- Process leads ---
  type ResultItem = {
    index: number
    status: 'created' | 'skipped' | 'error'
    lead_id?: string
    reason?: string
    error?: string
    warning?: string
  }

  const results: ResultItem[] = []
  const toInsert: { index: number; row: Record<string, unknown> }[] = []

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i]

    // Phone dedup
    if (lead.phone) {
      const normalized = lead.phone.replace(/\s+/g, '')
      if (existingPhones.has(normalized)) {
        results.push({ index: i, status: 'skipped', reason: 'duplicate_phone' })
        continue
      }
      existingPhones.add(normalized)
    }

    // Resolve buyer
    let originalBuyerId: string | null = null
    let warning: string | undefined
    if (lead.buyer?.trim()) {
      const matched = buyerIdMap.get(lead.buyer.trim())
      if (matched) {
        originalBuyerId = matched
      } else {
        warning = `Buyer "${lead.buyer}" not found — lead created without buyer assignment`
      }
    }

    toInsert.push({
      index: i,
      row: {
        org_id: orgId,
        first_name: lead.first_name,
        last_name: lead.last_name,
        email: lead.email,
        phone: lead.phone || null,
        postcode: lead.postcode,
        product: lead.product,
        source: lead.source,
        status: 'new',
        original_buyer_id: originalBuyerId,
      },
    })

    // Store warning for later
    if (warning) {
      results.push({ index: i, status: 'created', warning })
    }
  }

  // --- Batch insert ---
  let created = 0
  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE)
    const { data: inserted, error: insertError } = await supabase
      .from('leads')
      .insert(batch.map((b) => b.row))
      .select('id')

    if (insertError) {
      for (const item of batch) {
        const existing = results.find((r) => r.index === item.index)
        if (existing) {
          existing.status = 'error'
          existing.error = insertError.message
        } else {
          results.push({ index: item.index, status: 'error', error: insertError.message })
        }
      }
    } else if (inserted) {
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j]
        const existing = results.find((r) => r.index === item.index)
        if (existing) {
          existing.lead_id = inserted[j]?.id
        } else {
          results.push({ index: item.index, status: 'created', lead_id: inserted[j]?.id })
        }
      }
      created += inserted.length
    }
  }

  // Sort results by index
  results.sort((a, b) => a.index - b.index)

  const skipped = results.filter((r) => r.status === 'skipped').length
  const errored = results.filter((r) => r.status === 'error').length

  // --- Response ---
  if (isSingle) {
    const result = results[0]
    if (!result) {
      return NextResponse.json({ success: false, error: 'No lead processed' }, { status: 500 })
    }
    if (result.status === 'created') {
      return NextResponse.json({
        success: true,
        lead_id: result.lead_id,
        ...(result.warning ? { warning: result.warning } : {}),
      }, { status: 201 })
    }
    if (result.status === 'skipped') {
      return NextResponse.json({ success: false, error: `Lead skipped: ${result.reason}` }, { status: 409 })
    }
    return NextResponse.json({ success: false, error: result.error }, { status: 422 })
  }

  return NextResponse.json({
    success: errored === 0,
    summary: {
      total: leads.length,
      created,
      skipped,
      errored,
    },
    results,
  }, { status: 200 })
}
