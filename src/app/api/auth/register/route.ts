import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { registerSchema } from '@/lib/validations/auth'

export async function POST(request: NextRequest) {
  const body = await request.json()

  const result = registerSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 })
  }

  const { email, password, orgName } = result.data
  const supabase = createAdminClient()

  // Create auth user
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 })
  }

  const userId = authData.user.id

  // Create organization
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name: orgName, slug: `${slug}-${userId.slice(0, 8)}` })
    .select()
    .single()

  if (orgError) {
    // Cleanup: delete the created user
    await supabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 })
  }

  // Create org membership as owner
  const { error: memberError } = await supabase
    .from('org_members')
    .insert({ org_id: org.id, user_id: userId, role: 'owner' })

  if (memberError) {
    // Cleanup: delete org and user
    await supabase.from('organizations').delete().eq('id', org.id)
    await supabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Failed to create membership' }, { status: 500 })
  }

  return NextResponse.json({ message: 'Account created successfully' }, { status: 201 })
}
