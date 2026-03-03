'use client'

import { type ColumnDef } from '@tanstack/react-table'
import type { Lead } from '@/lib/types'
import { DataTable } from '@/components/shared/data-table'
import { LeadStatusBadge } from './lead-status-badge'
import { formatDate } from '@/lib/utils/format'
import { getLeadAgeDays } from '@/lib/utils/lead-status'
import type { LeadStatus } from '@/lib/constants'

const columns: ColumnDef<Lead, unknown>[] = [
  {
    accessorKey: 'first_name',
    header: 'Name',
    cell: ({ row }) => `${row.original.first_name} ${row.original.last_name}`,
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'postcode',
    header: 'Postcode',
  },
  {
    accessorKey: 'product',
    header: 'Product',
  },
  {
    id: 'original_buyer',
    header: 'Original Buyer',
    cell: ({ row }) => row.original.original_buyer?.company_name ?? '—',
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => <LeadStatusBadge status={row.original.status as LeadStatus} />,
  },
  {
    id: 'age',
    header: 'Age',
    cell: ({ row }) => `${getLeadAgeDays(row.original.created_at)}d`,
  },
  {
    accessorKey: 'created_at',
    header: 'Created',
    cell: ({ row }) => formatDate(row.original.created_at),
  },
]

interface LeadsTableProps {
  data: Lead[]
  onRowClick: (lead: Lead) => void
}

export function LeadsTable({ data, onRowClick }: LeadsTableProps) {
  return <DataTable columns={columns} data={data} onRowClick={onRowClick} />
}
