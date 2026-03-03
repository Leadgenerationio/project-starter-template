'use client'

import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { PRODUCTS, LEAD_STATUSES, LEAD_SOURCES, LEAD_STATUS_LABELS } from '@/lib/constants'
import { Search } from 'lucide-react'

interface LeadFiltersProps {
  filters: {
    search: string
    status: string
    product: string
    source: string
  }
  onFilterChange: (key: string, value: string) => void
}

export function LeadFilters({ filters, onFilterChange }: LeadFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search leads..."
          value={filters.search}
          onChange={(e) => onFilterChange('search', e.target.value)}
          className="pl-9"
        />
      </div>
      <Select value={filters.status} onChange={(e) => onFilterChange('status', e.target.value)}>
        <option value="">All Statuses</option>
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>
        ))}
      </Select>
      <Select value={filters.product} onChange={(e) => onFilterChange('product', e.target.value)}>
        <option value="">All Products</option>
        {PRODUCTS.map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </Select>
      <Select value={filters.source} onChange={(e) => onFilterChange('source', e.target.value)}>
        <option value="">All Sources</option>
        {LEAD_SOURCES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </Select>
    </div>
  )
}
