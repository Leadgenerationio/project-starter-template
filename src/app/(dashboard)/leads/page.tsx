'use client'

import { useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useDebounce } from '@/lib/hooks/use-debounce'
import { useLeads } from '@/lib/hooks/use-leads'
import { LeadsTable } from '@/components/leads/leads-table'
import { LeadFilters } from '@/components/leads/lead-filters'
import { DataTablePagination } from '@/components/shared/data-table-pagination'
import { PageHeader } from '@/components/shared/page-header'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { Button } from '@/components/ui/button'
import { Plus, Users } from 'lucide-react'
import type { Lead } from '@/lib/types'

export default function LeadsPage() {
  const router = useRouter()
  const [filters, setFilters] = useState({
    search: '',
    status: '',
    product: '',
    source: '',
    page: 1,
    pageSize: 20,
    sortBy: 'created_at',
    sortOrder: 'desc' as const,
  })

  const debouncedSearch = useDebounce(filters.search, 300)
  const debouncedFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  )
  const { data, isLoading } = useLeads(debouncedFilters)

  const handleFilterChange = useCallback((key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }))
  }, [])

  const handleRowClick = useCallback((lead: Lead) => {
    router.push(`/leads/${lead.id}`)
  }, [router])

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Manage your lead pipeline"
        actions={
          <Link href="/leads/new">
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Add Lead
            </Button>
          </Link>
        }
      />

      <LeadFilters filters={filters} onFilterChange={handleFilterChange} />

      {isLoading ? (
        <TableSkeleton />
      ) : data && data.data.length > 0 ? (
        <>
          <LeadsTable data={data.data} onRowClick={handleRowClick} />
          <DataTablePagination
            page={data.page}
            totalPages={data.totalPages}
            totalItems={data.count}
            pageSize={data.pageSize}
            onPageChange={(page) => setFilters((prev) => ({ ...prev, page }))}
          />
        </>
      ) : (
        <EmptyState
          icon={Users}
          title="No leads yet"
          description="Add your first lead to get started."
          action={
            <Link href="/leads/new">
              <Button>
                <Plus className="h-4 w-4 mr-1" />
                Add Lead
              </Button>
            </Link>
          }
        />
      )}
    </div>
  )
}
