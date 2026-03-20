import { NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'

export async function GET() {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId, user } = auth

  // Count user-specific and org-wide unread notifications separately to avoid filter string interpolation
  const [userCount, orgCount] = await Promise.all([
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .eq('read', false),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .is('user_id', null)
      .eq('read', false),
  ])

  const count = (userCount.count ?? 0) + (orgCount.count ?? 0)
  const error = userCount.error || orgCount.error

  if (error) {
    return NextResponse.json({ count: 0 })
  }

  return NextResponse.json({ count })
}
