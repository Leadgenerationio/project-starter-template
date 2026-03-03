import { z } from 'zod'

export const buyerSchema = z.object({
  company_name: z.string().min(1, 'Company name is required').max(200),
  contact_name: z.string().min(1, 'Contact name is required').max(200),
  email: z.string().email('Invalid email address'),
  phone: z.string().max(20).optional().nullable(),
  is_active: z.boolean(),
})

export const buyerUpdateSchema = buyerSchema.partial()

export type BuyerInput = z.infer<typeof buyerSchema>
export type BuyerUpdateInput = z.infer<typeof buyerUpdateSchema>
