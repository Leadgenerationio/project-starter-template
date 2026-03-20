import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'

export async function GET() {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth

  const { data, error } = await supabase
    .from('org_invites')
    .select('*')
    .eq('org_id', orgId)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch invites:', error.message)
    return NextResponse.json({ error: 'Failed to fetch invites' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId, role } = auth

  if (!['owner', 'admin'].includes(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { email, role: inviteRole } = await request.json()

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
  }

  if (inviteRole && !['admin', 'member'].includes(inviteRole)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  // Check if already a member
  const { data: existingMembers } = await supabase
    .from('org_members')
    .select('id, user_id')
    .eq('org_id', orgId)

  // We can't easily check email against user_id without admin client
  // So just check for existing invite
  const { data: existingInvite } = await supabase
    .from('org_invites')
    .select('id')
    .eq('org_id', orgId)
    .eq('email', email)
    .single()

  if (existingInvite) {
    return NextResponse.json({ error: 'Invite already sent to this email' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('org_invites')
    .insert({
      org_id: orgId,
      email,
      role: inviteRole || 'member',
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create invite:', error.message)
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const { inviteId } = await request.json()

  const { error } = await supabase
    .from('org_invites')
    .delete()
    .eq('id', inviteId)
    .eq('org_id', orgId)

  if (error) {
    console.error('Failed to delete invite:', error.message)
    return NextResponse.json({ error: 'Failed to delete invite' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
