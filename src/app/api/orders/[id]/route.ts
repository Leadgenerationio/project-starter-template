import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const { id } = await params

  const { data: order, error } = await supabase
    .from('orders')
    .select('*, buyer:buyers(id, company_name, contact_name, email)')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (error || !order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Get sales for this order
  const { data: sales } = await supabase
    .from('lead_sales')
    .select('*, lead:leads(id, first_name, last_name, email, postcode, product)')
    .eq('order_id', id)
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  return NextResponse.json({ ...order, sales: sales ?? [] })
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const { id } = await params

  // Only allow deleting draft orders
  const { data: order } = await supabase
    .from('orders')
    .select('status')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.status !== 'draft') {
    return NextResponse.json({ error: 'Can only delete draft orders' }, { status: 400 })
  }

  const { error } = await supabase
    .from('orders')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
