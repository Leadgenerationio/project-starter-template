'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useImportJob } from '@/lib/hooks/use-import-job'
import { PageHeader } from '@/components/shared/page-header'
import { useToast } from '@/components/ui/toast'
import { FileUploadStep } from '@/components/import/file-upload-step'
import { ColumnMappingStep } from '@/components/import/column-mapping-step'
import { ImportProgressStep } from '@/components/import/import-progress-step'
import type { PreviewResponse, ColumnMapping } from '@/lib/types'
import type { LeadAge } from '@/components/import/column-mapping-step'

type ImportStep = 'idle' | 'uploading' | 'mapping' | 'importing'

export default function ImportPage() {
  const { addToast } = useToast()
  const abortRef = useRef<AbortController | null>(null)
  const [step, setStep] = useState<ImportStep>('idle')
  const [preview, setPreview] = useState<PreviewResponse | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  const { data: job } = useImportJob(jobId)
  const previewRef = useRef(preview)
  previewRef.current = preview

  // Abort in-flight requests and clean up storage on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      const storagePath = previewRef.current?.storage_path
      if (storagePath) {
        fetch('/api/leads/import/preview', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storage_path: storagePath }),
        }).catch(() => {})
      }
    }
  }, [])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStep('idle')
  }, [])

  async function handleFileSelect(file: File) {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStep('uploading')

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/leads/import/preview', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
      const data = await res.json()

      if (!res.ok) {
        addToast({ title: 'Upload failed', description: data.error, variant: 'destructive' })
        setStep('idle')
        return
      }

      setPreview(data as PreviewResponse)
      setStep('mapping')
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      addToast({ title: 'Upload failed', description: 'Network error', variant: 'destructive' })
      setStep('idle')
    }
  }

  async function handleMappingConfirm(mapping: ColumnMapping, leadAge: LeadAge) {
    if (!preview) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setStep('importing')

    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storage_path: preview.storage_path,
          filename: preview.filename,
          column_mapping: mapping,
          lead_age: leadAge,
        }),
        signal: controller.signal,
      })
      const data = await res.json()

      if (!res.ok) {
        addToast({ title: 'Import failed', description: data.error, variant: 'destructive' })
        setStep('mapping')
        return
      }

      setJobId(data.id)
      addToast({ title: 'File submitted', description: 'Processing your leads...' })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      addToast({ title: 'Import failed', description: 'Network error', variant: 'destructive' })
      setStep('mapping')
    }
  }

  async function handleMappingCancel() {
    abortRef.current?.abort()
    abortRef.current = null
    if (preview?.storage_path) {
      try {
        await fetch('/api/leads/import/preview', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storage_path: preview.storage_path }),
        })
      } catch {
        // Best effort cleanup
      }
    }
    setPreview(null)
    setStep('idle')
  }

  function handleReset() {
    setJobId(null)
    setPreview(null)
    setStep('idle')
  }

  return (
    <div>
      <PageHeader title="Import Leads" description="Upload an Excel or CSV file to bulk-import leads" />

      <div className={step === 'mapping' || step === 'importing' ? 'max-w-3xl space-y-6' : 'max-w-lg space-y-6'}>
        {(step === 'idle' || step === 'uploading') && !jobId && (
          <FileUploadStep
            uploading={step === 'uploading'}
            onFileSelect={handleFileSelect}
            onCancel={handleCancel}
          />
        )}

        {(step === 'mapping' || step === 'importing') && preview && !jobId && (
          <ColumnMappingStep
            preview={preview}
            onConfirm={handleMappingConfirm}
            onCancel={handleMappingCancel}
            importing={step === 'importing'}
          />
        )}

        {job && (
          <ImportProgressStep job={job} onReset={handleReset} />
        )}
      </div>
    </div>
  )
}
