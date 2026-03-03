import { z } from 'zod'
import { PRODUCTS, LEAD_SOURCES } from '@/lib/constants'

export const importRowSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().email('Invalid email'),
  phone: z.string().optional().nullable(),
  postcode: z.string().min(2, 'Postcode is required'),
  product: z.enum(PRODUCTS),
  source: z.enum(LEAD_SOURCES).optional(),
})

export type ImportRow = z.infer<typeof importRowSchema>
