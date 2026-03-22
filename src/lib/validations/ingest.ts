import { z } from 'zod'
import { leadSchema } from './lead'

export const ingestLeadSchema = leadSchema
  .omit({ original_buyer_id: true })
  .extend({
    buyer: z.string().max(200).optional(),
  })

export const ingestRequestSchema = z.union([
  ingestLeadSchema,
  z.array(ingestLeadSchema).min(1).max(1000),
])

export type IngestLeadInput = z.infer<typeof ingestLeadSchema>
