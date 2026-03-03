import { NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'
import { extractArea } from '@/lib/utils/postcodes'

export async function GET() {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth

  // Fetch distinct postcodes from eligible leads
  const { data, error } = await supabase
    .from('leads')
    .select('postcode')
    .eq('org_id', orgId)
    .eq('status', 'eligible')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Extract unique area prefixes
  const areas = new Set<string>()
  for (const lead of data ?? []) {
    const area = extractArea(lead.postcode)
    if (area) areas.add(area)
  }

  const sorted = Array.from(areas).sort()
  return NextResponse.json({ areas: sorted })
}
