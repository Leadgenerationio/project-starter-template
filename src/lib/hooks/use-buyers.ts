'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Buyer } from '@/lib/types'
import type { BuyerInput } from '@/lib/validations/buyer'

export function useBuyers() {
  return useQuery<Buyer[]>({
    queryKey: ['buyers'],
    queryFn: async () => {
      const res = await fetch('/api/buyers')
      if (!res.ok) throw new Error('Failed to fetch buyers')
      return res.json()
    },
  })
}

export function useBuyer(id: string) {
  return useQuery<Buyer & { sales: unknown[] }>({
    queryKey: ['buyers', id],
    queryFn: async () => {
      const res = await fetch(`/api/buyers/${id}`)
      if (!res.ok) throw new Error('Failed to fetch buyer')
      return res.json()
    },
    enabled: !!id,
  })
}

export function useCreateBuyer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: BuyerInput) => {
      const res = await fetch('/api/buyers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create buyer')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyers'] })
    },
  })
}

export function useUpdateBuyer(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: Partial<BuyerInput>) => {
      const res = await fetch(`/api/buyers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to update buyer')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyers'] })
    },
  })
}

export function useDeleteBuyer() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/buyers/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to delete buyer')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['buyers'] })
    },
  })
}
