import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const params = request.nextUrl.searchParams

  const buyerId = params.get('buyer_id')
  const product = params.get('product')
  const postcodes = params.get('postcodes')?.split(',').filter(Boolean)

  // Count eligible leads that haven't been sold to this buyer
  let query = supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'eligible')

  if (product) query = query.eq('product', product)
  if (postcodes && postcodes.length > 0) {
    query = query.in('postcode', postcodes)
  }

  // Exclude leads already sold to this buyer or originally from this buyer
  if (buyerId) {
    query = query.neq('original_buyer_id', buyerId)

    // Get leads already sold to this buyer
    const { data: existingSales } = await supabase
      .from('lead_sales')
      .select('lead_id')
      .eq('buyer_id', buyerId)
      .eq('org_id', orgId)

    if (existingSales && existingSales.length > 0) {
      const soldLeadIds = existingSales.map((s) => s.lead_id)
      query = query.not('id', 'in', `(${soldLeadIds.join(',')})`)
    }
  }

  const { count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ count: count ?? 0 })
}
