import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'

export async function GET() {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth

  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single()

  if (error) {
    console.error('Failed to fetch organization:', error.message)
    return NextResponse.json({ error: 'Failed to fetch organization' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId, role } = auth

  if (role !== 'owner') {
    return NextResponse.json({ error: 'Only owners can update organization settings' }, { status: 403 })
  }

  const body = await request.json()
  const { name } = body

  if (!name || typeof name !== 'string' || name.length < 2) {
    return NextResponse.json({ error: 'Organization name must be at least 2 characters' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('organizations')
    .update({ name })
    .eq('id', orgId)
    .select()
    .single()

  if (error) {
    console.error('Failed to update organization:', error.message)
    return NextResponse.json({ error: 'Failed to update organization' }, { status: 500 })
  }

  return NextResponse.json(data)
}
