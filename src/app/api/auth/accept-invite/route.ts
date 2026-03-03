import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  const { token } = await request.json()

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Invalid invite token' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Must be logged in to accept invite' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Find the invite
  const { data: invite, error: inviteError } = await admin
    .from('org_invites')
    .select('*')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .single()

  if (inviteError || !invite) {
    return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 400 })
  }

  // Check if already a member of this org
  const { data: existingMember } = await admin
    .from('org_members')
    .select('id')
    .eq('org_id', invite.org_id)
    .eq('user_id', user.id)
    .single()

  if (existingMember) {
    // Already a member — just delete the invite and succeed
    await admin.from('org_invites').delete().eq('id', invite.id)
    return NextResponse.json({ success: true, message: 'Already a member' })
  }

  // Check if user is a member of a different org — remove the auto-created one from registration
  const { data: currentMemberships } = await admin
    .from('org_members')
    .select('id, org_id, role')
    .eq('user_id', user.id)

  // If user has a solo org (only member, owner role), remove it and the org
  if (currentMemberships && currentMemberships.length > 0) {
    for (const membership of currentMemberships) {
      const { count } = await admin
        .from('org_members')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', membership.org_id)

      // Only delete if this was a solo org (auto-created during registration)
      if (count === 1 && membership.role === 'owner') {
        await admin.from('org_members').delete().eq('id', membership.id)
        await admin.from('organizations').delete().eq('id', membership.org_id)
      }
    }
  }

  // Add user to the org
  const { error: memberError } = await admin
    .from('org_members')
    .insert({
      org_id: invite.org_id,
      user_id: user.id,
      role: invite.role,
    })

  if (memberError) {
    return NextResponse.json({ error: 'Failed to join organization' }, { status: 500 })
  }

  // Delete the used invite
  await admin.from('org_invites').delete().eq('id', invite.id)

  // Create notification
  await admin.from('notifications').insert({
    org_id: invite.org_id,
    type: 'info',
    title: 'New team member',
    message: `${user.email} joined the organization.`,
  })

  return NextResponse.json({ success: true })
}
