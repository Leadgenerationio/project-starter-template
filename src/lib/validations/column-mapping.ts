import { z } from 'zod'

export const columnMappingImportSchema = z.object({
  storage_path: z.string().min(1, 'Storage path is required'),
  filename: z.string().min(1, 'Filename is required'),
  column_mapping: z.record(z.string(), z.string()),
  lead_age: z.enum(['new', 'eligible']).optional(),
})
