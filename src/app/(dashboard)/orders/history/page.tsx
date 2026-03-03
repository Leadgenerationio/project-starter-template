'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useOrders } from '@/lib/hooks/use-orders'
import { DataTable } from '@/components/shared/data-table'
import { PageHeader } from '@/components/shared/page-header'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate, formatNumber } from '@/lib/utils/format'
import { ShoppingCart, Plus } from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import type { Order } from '@/lib/types'
import Link from 'next/link'

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  confirmed: 'bg-blue-100 text-blue-800',
  downloaded: 'bg-green-100 text-green-800',
}

const columns: ColumnDef<Order, unknown>[] = [
  {
    id: 'buyer',
    header: 'Buyer',
    cell: ({ row }) => (row.original.buyer as { company_name?: string })?.company_name ?? '—',
  },
  {
    accessorKey: 'product_filter',
    header: 'Product',
    cell: ({ row }) => row.original.product_filter || 'All',
  },
  {
    accessorKey: 'lead_count',
    header: 'Leads',
    cell: ({ row }) => formatNumber(row.original.lead_count),
  },
  {
    accessorKey: 'total_amount',
    header: 'Total',
    cell: ({ row }) => formatCurrency(row.original.total_amount),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge variant="secondary" className={statusColors[row.original.status] || ''}>
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: 'created_at',
    header: 'Date',
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

export default function OrderHistoryPage() {
  const router = useRouter()
  const { data: orders, isLoading } = useOrders()

  const handleRowClick = useCallback((order: Order) => {
    router.push(`/orders/${order.id}`)
  }, [router])

  return (
    <div>
      <PageHeader
        title="Order History"
        description="View all past and pending orders"
        actions={
          <Link href="/orders">
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              New Order
            </Button>
          </Link>
        }
      />

      {isLoading ? (
        <TableSkeleton />
      ) : orders && orders.length > 0 ? (
        <DataTable columns={columns} data={orders} onRowClick={handleRowClick} />
      ) : (
        <EmptyState
          icon={ShoppingCart}
          title="No orders yet"
          description="Create your first order to start selling leads."
          action={
            <Link href="/orders">
              <Button>
                <Plus className="h-4 w-4 mr-1" />
                Sell Leads
              </Button>
            </Link>
          }
        />
      )}
    </div>
  )
}
