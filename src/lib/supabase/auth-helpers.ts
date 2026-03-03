import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function getAuthenticatedOrg() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) {
    return { error: NextResponse.json({ error: 'No organization found' }, { status: 403 }) }
  }

  return {
    supabase,
    user,
    orgId: membership.org_id as string,
    role: membership.role as string,
  }
}
