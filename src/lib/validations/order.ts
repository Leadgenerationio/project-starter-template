import { z } from 'zod'
import { PRODUCTS } from '@/lib/constants'

export const orderSchema = z.object({
  buyer_id: z.string().uuid('Invalid buyer'),
  product_filter: z.enum(PRODUCTS).optional().nullable(),
  postcode_filters: z.array(z.string()).default([]),
  price_per_lead: z.coerce.number().min(0.01, 'Price must be greater than 0'),
})

export type OrderInput = z.infer<typeof orderSchema>
