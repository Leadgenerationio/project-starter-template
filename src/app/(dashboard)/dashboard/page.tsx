'use client'

import { useQuery } from '@tanstack/react-query'
import { PageHeader } from '@/components/shared/page-header'
import { MetricCard } from '@/components/dashboard/metric-card'
import { MetricCardsSkeleton } from '@/components/shared/loading-skeleton'
import { formatCurrency, formatNumber } from '@/lib/utils/format'
import { Users, CheckCircle, Clock, DollarSign } from 'lucide-react'
import type { DashboardStats } from '@/lib/types'

export default function DashboardPage() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const res = await fetch('/api/dashboard/stats')
      if (!res.ok) throw new Error('Failed to load stats')
      return res.json()
    },
  })

  return (
    <div>
      <PageHeader title="Dashboard" description="Overview of your lead pipeline" />

      {isLoading ? (
        <MetricCardsSkeleton />
      ) : stats ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Total Leads"
            value={formatNumber(stats.total_leads)}
            icon={Users}
          />
          <MetricCard
            title="Eligible for Resale"
            value={formatNumber(stats.eligible_leads)}
            description="30+ days old"
            icon={CheckCircle}
          />
          <MetricCard
            title="Aging"
            value={formatNumber(stats.aging_leads)}
            description="15-29 days old"
            icon={Clock}
          />
          <MetricCard
            title="Total Revenue"
            value={formatCurrency(stats.total_revenue)}
            icon={DollarSign}
          />
        </div>
      ) : (
        <div className="rounded-xl border p-6 text-center text-muted-foreground">
          Connect to Supabase to see your dashboard metrics.
        </div>
      )}
    </div>
  )
}
