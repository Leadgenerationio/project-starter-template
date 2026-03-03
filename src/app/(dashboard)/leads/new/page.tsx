'use client'

import { useRouter } from 'next/navigation'
import { useCreateLead } from '@/lib/hooks/use-leads'
import { LeadForm } from '@/components/leads/lead-form'
import { PageHeader } from '@/components/shared/page-header'
import { useToast } from '@/components/ui/toast'
import type { LeadInput } from '@/lib/validations/lead'

export default function NewLeadPage() {
  const router = useRouter()
  const { addToast } = useToast()
  const createLead = useCreateLead()

  function handleSubmit(data: LeadInput) {
    createLead.mutate(data, {
      onSuccess: () => {
        addToast({ title: 'Lead created successfully' })
        router.push('/leads')
      },
      onError: (err) => {
        addToast({ title: 'Failed to create lead', description: err.message, variant: 'destructive' })
      },
    })
  }

  return (
    <div>
      <PageHeader title="Add Lead" description="Create a new lead manually" />
      <LeadForm onSubmit={handleSubmit} loading={createLead.isPending} submitLabel="Create Lead" />
    </div>
  )
}
