'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { useOrder } from '@/lib/hooks/use-orders'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils/format'
import { ArrowLeft, Download } from 'lucide-react'
import type { LeadSale } from '@/lib/types'

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: order, isLoading } = useOrder(id)

  if (isLoading) return <TableSkeleton />
  if (!order) return <div>Order not found</div>

  const sales = (order.sales || []) as (LeadSale & { lead?: { first_name: string; last_name: string; email: string; product: string; postcode: string } })[]
  const buyer = order.buyer as { company_name?: string; contact_name?: string; email?: string } | undefined

  return (
    <div>
      <PageHeader
        title={`Order ${id.slice(0, 8)}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            {order.status !== 'draft' && (
              <Button onClick={() => window.open(`/api/orders/${id}/download`, '_blank')}>
                <Download className="h-4 w-4 mr-1" />
                Download CSV
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="secondary">{order.status}</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Buyer</span>
              <span>{buyer?.company_name ?? '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Product</span>
              <span>{order.product_filter || 'All'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Postcodes</span>
              <span>{order.postcode_filters?.join(', ') || 'All'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price/Lead</span>
              <span>{formatCurrency(order.price_per_lead)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Lead Count</span>
              <span>{formatNumber(order.lead_count)}</span>
            </div>
            <div className="flex justify-between font-bold border-t pt-3">
              <span>Total</span>
              <span>{formatCurrency(order.total_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(order.created_at)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leads in Order ({sales.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {sales.length === 0 ? (
              <p className="text-muted-foreground text-sm">Order not yet confirmed.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {sales.map((sale) => (
                  <div key={sale.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                    <div>
                      <p className="text-sm font-medium">
                        {sale.lead ? `${sale.lead.first_name} ${sale.lead.last_name}` : 'Unknown'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sale.lead?.email} · {sale.lead?.postcode}
                      </p>
                    </div>
                    <span className="text-sm">{formatCurrency(sale.price)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
