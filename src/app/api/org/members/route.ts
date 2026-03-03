import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const admin = createAdminClient()

  const { data: members, error } = await supabase
    .from('org_members')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Enrich with email from auth
  const enriched = await Promise.all(
    (members ?? []).map(async (member) => {
      const { data: { user } } = await admin.auth.admin.getUserById(member.user_id)
      return { ...member, user_email: user?.email ?? 'Unknown' }
    })
  )

  return NextResponse.json(enriched)
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId, role } = auth

  if (role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can remove members' }, { status: 403 })
  }

  const { memberId } = await request.json()

  const { error } = await supabase
    .from('org_members')
    .delete()
    .eq('id', memberId)
    .eq('org_id', orgId)
    .neq('role', 'owner') // Can't remove owner

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
