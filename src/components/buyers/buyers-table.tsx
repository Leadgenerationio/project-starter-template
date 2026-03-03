'use client'

import { type ColumnDef } from '@tanstack/react-table'
import type { Buyer } from '@/lib/types'
import { DataTable } from '@/components/shared/data-table'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils/format'

const columns: ColumnDef<Buyer, unknown>[] = [
  {
    accessorKey: 'company_name',
    header: 'Company',
  },
  {
    accessorKey: 'contact_name',
    header: 'Contact',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ row }) =>
      row.original.is_active ? (
        <Badge variant="secondary" className="bg-green-100 text-green-800">Active</Badge>
      ) : (
        <Badge variant="secondary" className="bg-gray-100 text-gray-800">Inactive</Badge>
      ),
  },
  {
    accessorKey: 'total_leads_purchased',
    header: 'Leads',
    cell: ({ row }) => row.original.total_leads_purchased ?? 0,
  },
  {
    accessorKey: 'total_spent',
    header: 'Total Spent',
    cell: ({ row }) => formatCurrency(row.original.total_spent ?? 0),
  },
]

interface BuyersTableProps {
  data: Buyer[]
  onRowClick: (buyer: Buyer) => void
}

export function BuyersTable({ data, onRowClick }: BuyersTableProps) {
  return <DataTable columns={columns} data={data} onRowClick={onRowClick} />
}
