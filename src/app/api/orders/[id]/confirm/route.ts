import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'
import { buildPostcodeOrFilter } from '@/lib/utils/postcodes'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const { id } = await params

  // Get the order
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (orderError || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.status !== 'draft') {
    return NextResponse.json({ error: 'Order already confirmed' }, { status: 400 })
  }

  // Fetch eligible leads matching filters (with buyer exclusion)
  let query = supabase
    .from('leads')
    .select('id')
    .eq('org_id', orgId)
    .eq('status', 'eligible')
    .neq('original_buyer_id', order.buyer_id)

  if (order.product_filter) query = query.eq('product', order.product_filter)
  if (order.postcode_filters && order.postcode_filters.length > 0) {
    const orFilter = buildPostcodeOrFilter(order.postcode_filters)
    if (orFilter) query = query.or(orFilter)
  }

  // Exclude leads already sold to this buyer
  const { data: existingSales } = await supabase
    .from('lead_sales')
    .select('lead_id')
    .eq('buyer_id', order.buyer_id)
    .eq('org_id', orgId)

  if (existingSales && existingSales.length > 0) {
    const soldLeadIds = existingSales.map((s) => s.lead_id)
    query = query.not('id', 'in', `(${soldLeadIds.join(',')})`)
  }

  const { data: leads, error: leadsError } = await query

  if (leadsError) {
    return NextResponse.json({ error: 'Failed to fetch leads' }, { status: 500 })
  }

  if (!leads || leads.length === 0) {
    return NextResponse.json({ error: 'No eligible leads found' }, { status: 400 })
  }

  // Create lead_sales records in one batch insert
  const salesRecords = leads.map((lead) => ({
    org_id: orgId,
    lead_id: lead.id,
    buyer_id: order.buyer_id,
    order_id: id,
    sale_type: 'resale' as const,
    price: order.price_per_lead,
  }))

  const { error: salesError } = await supabase
    .from('lead_sales')
    .insert(salesRecords)

  if (salesError) {
    return NextResponse.json({ error: 'Failed to create sales records' }, { status: 500 })
  }

  // Batch update all leads in ONE database call via RPC
  const leadIds = leads.map((l) => l.id)
  const { error: rpcError } = await supabase.rpc('confirm_order_leads', {
    p_lead_ids: leadIds,
    p_price_per_lead: order.price_per_lead,
  })

  if (rpcError) {
    // Fallback: single batch update without the function
    // This handles the case where the migration hasn't been run yet
    const { error: batchError } = await supabase
      .from('leads')
      .update({ status: 'resold' })
      .in('id', leadIds)

    if (batchError) {
      return NextResponse.json({ error: 'Failed to update lead statuses' }, { status: 500 })
    }
  }

  // Update order status and final counts
  const finalCount = leads.length
  const finalAmount = finalCount * order.price_per_lead

  const { error: updateError } = await supabase
    .from('orders')
    .update({
      status: 'confirmed',
      lead_count: finalCount,
      total_amount: finalAmount,
    })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: 'Order created but failed to update status' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    lead_count: finalCount,
    total_amount: finalAmount,
  })
}
