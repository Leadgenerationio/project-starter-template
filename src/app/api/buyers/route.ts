import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'
import { buyerSchema } from '@/lib/validations/buyer'

export async function GET() {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth

  // Single query: buyers + aggregated sales stats via left join
  // Uses the buyer_stats view if available, otherwise falls back to manual aggregation
  const { data: buyers, error: buyersError } = await supabase
    .from('buyers')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (buyersError) {
    return NextResponse.json({ error: buyersError.message }, { status: 500 })
  }

  if (!buyers || buyers.length === 0) {
    return NextResponse.json([])
  }

  // Single query to get all sales aggregated by buyer_id
  const buyerIds = buyers.map((b) => b.id)
  const { data: allSales } = await supabase
    .from('lead_sales')
    .select('buyer_id, price')
    .eq('org_id', orgId)
    .in('buyer_id', buyerIds)

  // Aggregate in memory — O(n) instead of O(n) DB queries
  const statsMap = new Map<string, { count: number; total: number }>()
  for (const sale of allSales ?? []) {
    const existing = statsMap.get(sale.buyer_id) ?? { count: 0, total: 0 }
    existing.count++
    existing.total += Number(sale.price)
    statsMap.set(sale.buyer_id, existing)
  }

  const enriched = buyers.map((buyer) => {
    const stats = statsMap.get(buyer.id)
    return {
      ...buyer,
      total_leads_purchased: stats?.count ?? 0,
      total_spent: stats?.total ?? 0,
    }
  })

  return NextResponse.json(enriched)
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const body = await request.json()

  const result = buyerSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('buyers')
    .insert({ ...result.data, org_id: orgId })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
