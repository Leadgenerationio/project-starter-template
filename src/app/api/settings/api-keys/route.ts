import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'
import { generateApiKey, hashApiKey } from '@/lib/supabase/api-key-auth'

export async function GET() {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, created_at, last_used_at, is_active')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId, role } = auth

  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can create API keys' }, { status: 403 })
  }

  const body = await request.json()
  const name = body.name?.trim()

  if (!name || name.length > 100) {
    return NextResponse.json({ error: 'Name is required (max 100 characters)' }, { status: 400 })
  }

  const rawKey = generateApiKey()
  const keyHash = hashApiKey(rawKey)

  const { data, error } = await supabase
    .from('api_keys')
    .insert({ org_id: orgId, key_hash: keyHash, name })
    .select('id, name, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 })
  }

  // Return the raw key ONCE — it can never be retrieved again
  return NextResponse.json({ ...data, key: rawKey }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId, role } = auth

  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can update API keys' }, { status: 403 })
  }

  const body = await request.json()
  const { id, is_active } = body

  if (!id || typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'id and is_active are required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('api_keys')
    .update({ is_active })
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: 'Failed to update API key' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId, role } = auth

  if (role !== 'owner' && role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can delete API keys' }, { status: 403 })
  }

  const body = await request.json()
  const { id } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
