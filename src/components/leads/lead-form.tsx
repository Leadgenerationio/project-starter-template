'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { leadSchema, type LeadInput } from '@/lib/validations/lead'
import { PRODUCTS, LEAD_SOURCES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

interface LeadFormProps {
  defaultValues?: Partial<LeadInput>
  onSubmit: (data: LeadInput) => void
  loading?: boolean
  submitLabel?: string
}

export function LeadForm({ defaultValues, onSubmit, loading, submitLabel = 'Save Lead' }: LeadFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<LeadInput>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      source: 'Website',
      ...defaultValues,
    },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="first_name">First Name</Label>
          <Input id="first_name" {...register('first_name')} />
          {errors.first_name && <p className="text-sm text-destructive">{errors.first_name.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="last_name">Last Name</Label>
          <Input id="last_name" {...register('last_name')} />
          {errors.last_name && <p className="text-sm text-destructive">{errors.last_name.message}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" {...register('phone')} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="postcode">Postcode</Label>
          <Input id="postcode" {...register('postcode')} />
          {errors.postcode && <p className="text-sm text-destructive">{errors.postcode.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="product">Product</Label>
          <Select id="product" {...register('product')}>
            <option value="">Select product</option>
            {PRODUCTS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
          {errors.product && <p className="text-sm text-destructive">{errors.product.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="source">Source</Label>
          <Select id="source" {...register('source')}>
            {LEAD_SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? 'Saving...' : submitLabel}
      </Button>
    </form>
  )
}
