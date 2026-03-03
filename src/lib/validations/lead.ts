import { z } from 'zod'
import { PRODUCTS, LEAD_SOURCES } from '@/lib/constants'

export const leadSchema = z.object({
  first_name: z.string().min(1, 'First name is required').max(100),
  last_name: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address'),
  phone: z.string().max(20).optional().nullable(),
  postcode: z.string().min(2, 'Postcode is required').max(10),
  product: z.enum(PRODUCTS),
  source: z.enum(LEAD_SOURCES),
  original_buyer_id: z.string().uuid().optional().nullable(),
})

export const leadUpdateSchema = leadSchema.partial()

export const leadFilterSchema = z.object({
  status: z.string().optional(),
  product: z.string().optional(),
  source: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.string().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export type LeadInput = z.infer<typeof leadSchema>
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>
export type LeadFilterInput = z.infer<typeof leadFilterSchema>
