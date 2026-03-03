'use client'

import { useState, useRef, useCallback } from 'react'
import { useImportJob } from '@/lib/hooks/use-import-job'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { formatNumber } from '@/lib/utils/format'
import type { ImportError } from '@/lib/types'

export default function ImportPage() {
  const { addToast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [uploading, setUploading] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)

  const { data: job } = useImportJob(jobId)

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setUploading(false)
  }, [])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setUploading(true)
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/leads/import', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
      const data = await res.json()

      if (!res.ok) {
        addToast({ title: 'Upload failed', description: data.error, variant: 'destructive' })
        setUploading(false)
        return
      }

      setJobId(data.id)
      setUploading(false)
      addToast({ title: 'File uploaded', description: 'Processing your leads...' })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      addToast({ title: 'Upload failed', description: 'Network error', variant: 'destructive' })
      setUploading(false)
    }
  }

  const progress = job ? (job.total_rows > 0 ? Math.round((job.processed_rows / job.total_rows) * 100) : 0) : 0

  return (
    <div>
      <PageHeader title="Import Leads" description="Upload an Excel or CSV file to bulk-import leads" />

      <div className="max-w-lg space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
            <CardDescription>
              Supported formats: .xlsx, .xls, .csv (max 10MB).
              Required columns: First Name, Last Name, Email, Postcode, Product
            </CardDescription>
          </CardHeader>
          <CardContent>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleUpload}
              className="hidden"
            />
            <Button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full"
              variant="outline"
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Uploading...</>
              ) : (
                <><Upload className="h-4 w-4 mr-2" /> Choose File</>
              )}
            </Button>
            {uploading && (
              <Button variant="ghost" size="sm" onClick={handleCancel} className="mt-2 w-full text-muted-foreground">
                Cancel Upload
              </Button>
            )}
          </CardContent>
        </Card>

        {job && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                {job.filename}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Progress bar */}
              {(job.status === 'pending' || job.status === 'processing') && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Processing...</span>
                    <span>{formatNumber(job.processed_rows)} / {formatNumber(job.total_rows)} rows</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {job.status === 'completed' && (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">Import complete</span>
                </div>
              )}

              {job.status === 'failed' && (
                <div className="flex items-center gap-2 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <span className="font-medium">Import failed</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold">{formatNumber(job.success_count)}</div>
                  <div className="text-xs text-muted-foreground">Imported</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-destructive">{formatNumber(job.error_count)}</div>
                  <div className="text-xs text-muted-foreground">Errors</div>
                </div>
                <div>
                  <div className="text-2xl font-bold">{formatNumber(job.total_rows)}</div>
                  <div className="text-xs text-muted-foreground">Total</div>
                </div>
              </div>

              {job.errors && (job.errors as ImportError[]).length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Errors</h4>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {(job.errors as ImportError[]).slice(0, 20).map((err, i) => (
                      <div key={i} className="text-xs text-destructive bg-destructive/5 rounded p-2">
                        Row {err.row}: {err.field} - {err.message}
                      </div>
                    ))}
                    {(job.errors as ImportError[]).length > 20 && (
                      <div className="text-xs text-muted-foreground">
                        ...and {(job.errors as ImportError[]).length - 20} more errors
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(job.status === 'completed' || job.status === 'failed') && (
                <Button
                  variant="outline"
                  onClick={() => { setJobId(null); if (fileRef.current) fileRef.current.value = '' }}
                >
                  Upload Another File
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
