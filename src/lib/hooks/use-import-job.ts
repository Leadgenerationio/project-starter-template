'use client'

import { useQuery } from '@tanstack/react-query'
import type { ImportJob } from '@/lib/types'

export function useImportJob(jobId: string | null) {
  return useQuery<ImportJob>({
    queryKey: ['import-jobs', jobId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/import/${jobId}`)
      if (!res.ok) throw new Error('Failed to fetch import job')
      return res.json()
    },
    enabled: !!jobId,
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return 3000
      if (data.status === 'completed' || data.status === 'failed') return false
      // Exponential backoff: 3s → 5s → 10s → 15s
      const processed = data.processed_rows
      if (processed < 50) return 3000
      if (processed < 200) return 5000
      if (processed < 500) return 10000
      return 15000
    },
  })
}
