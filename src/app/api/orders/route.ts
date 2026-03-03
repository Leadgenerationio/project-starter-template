import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'
import { orderSchema } from '@/lib/validations/order'

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const body = await request.json()

  const result = orderSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 })
  }

  const { buyer_id, product_filter, postcode_filters, price_per_lead } = result.data

  // Count eligible leads for this order (with buyer exclusion)
  let query = supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'eligible')
    .neq('original_buyer_id', buyer_id)

  if (product_filter) query = query.eq('product', product_filter)
  if (postcode_filters.length > 0) query = query.in('postcode', postcode_filters)

  // Exclude leads already sold to this buyer
  const { data: existingSales } = await supabase
    .from('lead_sales')
    .select('lead_id')
    .eq('buyer_id', buyer_id)
    .eq('org_id', orgId)

  if (existingSales && existingSales.length > 0) {
    const soldLeadIds = existingSales.map((s) => s.lead_id)
    query = query.not('id', 'in', `(${soldLeadIds.join(',')})`)
  }

  const { count } = await query
  const leadCount = count ?? 0
  const totalAmount = leadCount * price_per_lead

  const { data: order, error } = await supabase
    .from('orders')
    .insert({
      org_id: orgId,
      buyer_id,
      product_filter: product_filter || null,
      postcode_filters,
      price_per_lead,
      lead_count: leadCount,
      total_amount: totalAmount,
      status: 'draft',
    })
    .select('*, buyer:buyers(id, company_name)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(order, { status: 201 })
}
