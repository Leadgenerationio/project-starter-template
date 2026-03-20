import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'
import { buyerUpdateSchema } from '@/lib/validations/buyer'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const { id } = await params

  const { data: buyer, error } = await supabase
    .from('buyers')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (error || !buyer) {
    return NextResponse.json({ error: 'Buyer not found' }, { status: 404 })
  }

  // Get purchase history
  const { data: sales } = await supabase
    .from('lead_sales')
    .select('*, lead:leads(id, first_name, last_name, email, product)')
    .eq('buyer_id', id)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  const totalSpent = sales?.reduce((sum, s) => sum + Number(s.price), 0) ?? 0

  return NextResponse.json({
    ...buyer,
    total_leads_purchased: sales?.length ?? 0,
    total_spent: totalSpent,
    sales: sales ?? [],
  })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const { id } = await params
  const body = await request.json()

  const result = buyerUpdateSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('buyers')
    .update(result.data)
    .eq('id', id)
    .eq('org_id', orgId)
    .select()
    .single()

  if (error) {
    console.error('Failed to update buyer:', error.message)
    return NextResponse.json({ error: 'Failed to update buyer' }, { status: 500 })
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
    .from('buyers')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) {
    console.error('Failed to delete buyer:', error.message)
    return NextResponse.json({ error: 'Failed to delete buyer' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
