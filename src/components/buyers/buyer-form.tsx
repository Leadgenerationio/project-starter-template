'use client'

import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { buyerSchema, type BuyerInput } from '@/lib/validations/buyer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface BuyerFormProps {
  defaultValues?: Partial<BuyerInput>
  onSubmit: (data: BuyerInput) => void
  loading?: boolean
  submitLabel?: string
}

export function BuyerForm({ defaultValues, onSubmit, loading, submitLabel = 'Save Buyer' }: BuyerFormProps) {
  const { register, handleSubmit, formState: { errors } } = useForm<BuyerInput>({
    resolver: zodResolver(buyerSchema),
    defaultValues: {
      is_active: true,
      ...defaultValues,
    },
  })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-w-lg">
      <div className="space-y-2">
        <Label htmlFor="company_name">Company Name</Label>
        <Input id="company_name" {...register('company_name')} />
        {errors.company_name && <p className="text-sm text-destructive">{errors.company_name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="contact_name">Contact Name</Label>
        <Input id="contact_name" {...register('contact_name')} />
        {errors.contact_name && <p className="text-sm text-destructive">{errors.contact_name.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" {...register('email')} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" {...register('phone')} />
      </div>

      <Button type="submit" disabled={loading}>
        {loading ? 'Saving...' : submitLabel}
      </Button>
    </form>
  )
}
