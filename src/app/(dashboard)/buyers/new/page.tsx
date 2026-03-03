'use client'

import { useRouter } from 'next/navigation'
import { useCreateBuyer } from '@/lib/hooks/use-buyers'
import { BuyerForm } from '@/components/buyers/buyer-form'
import { PageHeader } from '@/components/shared/page-header'
import { useToast } from '@/components/ui/toast'
import type { BuyerInput } from '@/lib/validations/buyer'

export default function NewBuyerPage() {
  const router = useRouter()
  const { addToast } = useToast()
  const createBuyer = useCreateBuyer()

  function handleSubmit(data: BuyerInput) {
    createBuyer.mutate(data, {
      onSuccess: () => {
        addToast({ title: 'Buyer created successfully' })
        router.push('/buyers')
      },
      onError: (err) => {
        addToast({ title: 'Failed to create buyer', description: err.message, variant: 'destructive' })
      },
    })
  }

  return (
    <div>
      <PageHeader title="Add Buyer" description="Register a new lead buyer" />
      <BuyerForm onSubmit={handleSubmit} loading={createBuyer.isPending} submitLabel="Create Buyer" />
    </div>
  )
}
