'use client'

import { use } from 'react'
import { useRouter } from 'next/navigation'
import { useLead, useDeleteLead } from '@/lib/hooks/use-leads'
import { PageHeader } from '@/components/shared/page-header'
import { LeadAgingBar } from '@/components/leads/lead-aging-bar'
import { LeadStatusBadge } from '@/components/leads/lead-status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/shared/confirm-dialog'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import { Trash2, ArrowLeft } from 'lucide-react'
import { useState } from 'react'
import type { LeadStatus } from '@/lib/constants'
import type { LeadSale } from '@/lib/types'

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { addToast } = useToast()
  const { data: lead, isLoading } = useLead(id)
  const deleteLead = useDeleteLead()
  const [showDelete, setShowDelete] = useState(false)

  if (isLoading) return <TableSkeleton />
  if (!lead) return <div>Lead not found</div>

  function handleDelete() {
    deleteLead.mutate(id, {
      onSuccess: () => {
        addToast({ title: 'Lead deleted' })
        router.push('/leads')
      },
      onError: (err) => {
        addToast({ title: 'Failed to delete', description: err.message, variant: 'destructive' })
      },
    })
  }

  const sales = (lead.sales || []) as LeadSale[]

  return (
    <div>
      <PageHeader
        title={`${lead.first_name} ${lead.last_name}`}
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
            <CardTitle>Lead Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <LeadStatusBadge status={lead.status as LeadStatus} />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span>{lead.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Phone</span>
              <span>{lead.phone || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Postcode</span>
              <span>{lead.postcode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Product</span>
              <span>{lead.product}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Source</span>
              <span>{lead.source}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDate(lead.created_at)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Revenue</span>
              <span>{formatCurrency(lead.total_revenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Times Resold</span>
              <span>{lead.resale_count}</span>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Aging Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <LeadAgingBar createdAt={lead.created_at} status={lead.status} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sale History</CardTitle>
            </CardHeader>
            <CardContent>
              {sales.length === 0 ? (
                <p className="text-muted-foreground text-sm">No sales yet.</p>
              ) : (
                <div className="space-y-3">
                  {sales.map((sale: LeadSale) => (
                    <div key={sale.id} className="flex justify-between items-center border-b pb-2 last:border-0">
                      <div>
                        <p className="text-sm font-medium">{(sale.buyer as { company_name?: string })?.company_name ?? 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(sale.created_at)} · {sale.sale_type}</p>
                      </div>
                      <span className="text-sm font-medium">{formatCurrency(sale.price)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={showDelete}
        onOpenChange={setShowDelete}
        title="Delete Lead"
        description="This action cannot be undone. The lead and all associated data will be permanently deleted."
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteLead.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
