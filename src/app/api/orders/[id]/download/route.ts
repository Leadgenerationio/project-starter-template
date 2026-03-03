import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const { id } = await params

  // Get order and its sales with lead details
  const { data: order } = await supabase
    .from('orders')
    .select('*, buyer:buyers(company_name)')
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (order.status === 'draft') {
    return NextResponse.json({ error: 'Order must be confirmed before download' }, { status: 400 })
  }

  const { data: sales } = await supabase
    .from('lead_sales')
    .select('*, lead:leads(first_name, last_name, email, phone, postcode, product, source)')
    .eq('order_id', id)
    .eq('org_id', orgId)

  if (!sales || sales.length === 0) {
    return NextResponse.json({ error: 'No leads in this order' }, { status: 400 })
  }

  // Generate CSV
  const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Postcode', 'Product', 'Source']
  const rows = sales.map((sale) => {
    const lead = sale.lead as { first_name: string; last_name: string; email: string; phone: string | null; postcode: string; product: string; source: string }
    return [
      lead.first_name,
      lead.last_name,
      lead.email,
      lead.phone || '',
      lead.postcode,
      lead.product,
      lead.source,
    ]
  })

  const escape = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`
    }
    return val
  }

  const csv = [
    headers.join(','),
    ...rows.map((row) => row.map(escape).join(',')),
  ].join('\n')

  // Mark order as downloaded
  await supabase
    .from('orders')
    .update({ status: 'downloaded' })
    .eq('id', id)

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="order-${id.slice(0, 8)}-leads.csv"`,
    },
  })
}
