'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useBuyer, useDeleteBuyer } from '@/lib/hooks/use-buyers'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { Trash2, ArrowLeft } from 'lucide-react'
import type { LeadSale } from '@/lib/types'

export default function BuyerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { addToast } = useToast()
  const { data: buyer, isLoading } = useBuyer(id)
  const deleteBuyer = useDeleteBuyer()
  const [showDelete, setShowDelete] = useState(false)

  if (isLoading) return <TableSkeleton />
  if (!buyer) return <div>Buyer not found</div>

  function handleDelete() {
    deleteBuyer.mutate(id, {
      onSuccess: () => {
        addToast({ title: 'Buyer deleted' })
        router.push('/buyers')
      },
      onError: (err) => {
        addToast({ title: 'Failed to delete', description: err.message, variant: 'destructive' })
      },
    })
  }

  const sales = (buyer.sales || []) as (LeadSale & { lead?: { first_name: string; last_name: string; email: string; product: string } })[]

  return (
    <div>
      <PageHeader
        title={buyer.company_name}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Button variant="destructive" onClick={() => setShowDelete(true)}>
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Buyer Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              {buyer.is_active ? (
                <Badge variant="secondary" className="bg-green-100 text-green-800">Active</Badge>
              ) : (
                <Badge variant="secondary" className="bg-gray-100 text-gray-800">Inactive</Badge>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contact</span>
              <span>{buyer.contact_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{buyer.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span>{buyer.phone || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Leads</span>
              <span>{buyer.total_leads_purchased ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Spent</span>
              <span>{formatCurrency(buyer.total_spent ?? 0)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Purchase History</CardTitle>
          </CardHeader>
          <CardContent>
            {sales.length === 0 ? (
              <p className="text-muted-foreground text-sm">No purchases yet.</p>
            ) : (
              <div className="space-y-3">
                {sales.map((sale) => (
                  <div key={sale.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                    <div>
                      <p className="text-sm font-medium">
                        {sale.lead ? `${sale.lead.first_name} ${sale.lead.last_name}` : 'Unknown Lead'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {sale.lead?.product} · {formatDate(sale.created_at)} · {sale.sale_type}
                      </p>
                    </div>
                    <span className="text-sm font-medium">{formatCurrency(sale.price)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete Buyer"
        description="This will permanently delete this buyer. Orders associated with this buyer will be preserved."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteBuyer.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
