import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'
import { leadUpdateSchema } from '@/lib/validations/lead'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const { id } = await params

  const { data, error } = await supabase
    .from('leads')
    .select('*, original_buyer:buyers!leads_original_buyer_id_fkey(id, company_name, contact_name, email)')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
  }

  // Get sale history
  const { data: sales } = await supabase
    .from('lead_sales')
    .select('*, buyer:buyers(id, company_name)')
    .eq('lead_id', id)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  return NextResponse.json({ ...data, sales: sales ?? [] })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const { id } = await params
  const body = await request.json()

  const result = leadUpdateSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('leads')
    .update(result.data)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    console.error('Failed to update lead:', error.message)
    return NextResponse.json({ error: 'Failed to update lead' }, { status: 500 })
  }

  return NextResponse.json(data)
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId, role } = auth

  if (role === 'member') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { id } = await params

  const { error } = await supabase
    .from('leads')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) {
    console.error('Failed to delete lead:', error.message)
    return NextResponse.json({ error: 'Failed to delete lead' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
