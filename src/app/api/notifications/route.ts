import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'

export async function GET() {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId, user } = auth

  // Fetch user-specific and org-wide notifications separately to avoid filter string interpolation
  const [userNotifs, orgNotifs] = await Promise.all([
    supabase
      .from('notifications')
      .select('*')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('notifications')
      .select('*')
      .eq('org_id', orgId)
      .is('user_id', null)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const data = [...(userNotifs.data ?? []), ...(orgNotifs.data ?? [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50)
  const error = userNotifs.error || orgNotifs.error

  if (error) {
    console.error('Failed to fetch notifications:', error.message)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId, user } = auth
  const { ids } = await request.json()

  if (!ids || !Array.isArray(ids)) {
    return NextResponse.json({ error: 'ids array required' }, { status: 400 })
  }

  // Validate all IDs are UUIDs to prevent injection
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!ids.every((id: unknown) => typeof id === 'string' && uuidRegex.test(id))) {
    return NextResponse.json({ error: 'All ids must be valid UUIDs' }, { status: 400 })
  }

  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .in('id', ids)
    .eq('org_id', orgId)

  if (error) {
    console.error('Failed to mark notifications as read:', error.message)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
