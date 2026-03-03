import { NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'

export async function GET() {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth

  const { data, error } = await supabase
    .rpc('get_dashboard_stats', { p_org_id: orgId })
    .single()

  if (error) {
    // Fallback: compute stats manually if function doesn't exist yet
    const { count: totalLeads } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)

    const { count: eligibleLeads } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'eligible')

    const { count: agingLeads } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'aging')

    const { data: revenueData } = await supabase
      .from('lead_sales')
      .select('price')
      .eq('org_id', orgId)

    const totalRevenue = revenueData?.reduce((sum, s) => sum + Number(s.price), 0) ?? 0

    return NextResponse.json({
      total_leads: totalLeads ?? 0,
      eligible_leads: eligibleLeads ?? 0,
      aging_leads: agingLeads ?? 0,
      total_revenue: totalRevenue,
    })
  }

  return NextResponse.json(data)
}
