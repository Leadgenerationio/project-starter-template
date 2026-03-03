'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Order } from '@/lib/types'
import type { OrderInput } from '@/lib/validations/order'

export function useOrders() {
  return useQuery<Order[]>({
    queryKey: ['orders', 'history'],
    queryFn: async () => {
      const res = await fetch('/api/orders/history')
      if (!res.ok) throw new Error('Failed to fetch orders')
      return res.json()
    },
  })
}

export function useOrder(id: string) {
  return useQuery<Order & { sales: unknown[] }>({
    queryKey: ['orders', id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}`)
      if (!res.ok) throw new Error('Failed to fetch order')
      return res.json()
    },
    enabled: !!id,
  })
}

export function useCreateOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (data: OrderInput) => {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create order')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })
}

export function useConfirmOrder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/orders/${id}/confirm`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to confirm order')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['leads'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useLeadCount(params: { buyer_id?: string; product?: string; postcodes?: string }) {
  return useQuery<{ count: number }>({
    queryKey: ['leads', 'count', params],
    queryFn: async () => {
      const searchParams = new URLSearchParams()
      if (params.buyer_id) searchParams.set('buyer_id', params.buyer_id)
      if (params.product) searchParams.set('product', params.product)
      if (params.postcodes) searchParams.set('postcodes', params.postcodes)
      const res = await fetch(`/api/leads/count?${searchParams}`)
      if (!res.ok) return { count: 0 }
      return res.json()
    },
    enabled: !!params.buyer_id,
  })
}
