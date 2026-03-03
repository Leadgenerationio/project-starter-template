'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useBuyers } from '@/lib/hooks/use-buyers'
import { BuyersTable } from '@/components/buyers/buyers-table'
import { PageHeader } from '@/components/shared/page-header'
import { TableSkeleton } from '@/components/shared/loading-skeleton'
import { EmptyState } from '@/components/shared/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, UserCheck } from 'lucide-react'
import { formatCurrency, formatNumber } from '@/lib/utils/format'
import type { Buyer } from '@/lib/types'

export default function BuyersPage() {
  const router = useRouter()
  const { data: buyers, isLoading } = useBuyers()

  const handleRowClick = useCallback((buyer: Buyer) => {
    router.push(`/buyers/${buyer.id}`)
  }, [router])

  const totalBuyers = buyers?.length ?? 0
  const activeBuyers = buyers?.filter((b) => b.is_active).length ?? 0
  const totalRevenue = buyers?.reduce((sum, b) => sum + (b.total_spent ?? 0), 0) ?? 0

  return (
    <div>
      <PageHeader
        title="Buyers"
        description="Manage your lead buyers"
        actions={
          <Link href="/buyers/new">
            <Button>
              <Plus className="h-4 w-4 mr-1" />
              Add Buyer
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Buyers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatNumber(totalBuyers)}</div>
            <p className="text-xs text-muted-foreground">{activeBuyers} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Leads Sold</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(buyers?.reduce((sum, b) => sum + (b.total_leads_purchased ?? 0), 0) ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalRevenue)}</div>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : buyers && buyers.length > 0 ? (
        <BuyersTable data={buyers} onRowClick={handleRowClick} />
      ) : (
        <EmptyState
          icon={UserCheck}
          title="No buyers yet"
          description="Add your first buyer to start selling leads."
          action={
            <Link href="/buyers/new">
              <Button>
                <Plus className="h-4 w-4 mr-1" />
                Add Buyer
              </Button>
            </Link>
          }
        />
      )}
    </div>
  )
}
