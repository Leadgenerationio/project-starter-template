'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react'
import { formatNumber } from '@/lib/utils/format'
import type { ImportJob, ImportError } from '@/lib/types'

interface ImportProgressStepProps {
  job: ImportJob
  onReset: () => void
}

export function ImportProgressStep({ job, onReset }: ImportProgressStepProps) {
  const progress = job.total_rows > 0
    ? Math.round((job.processed_rows / job.total_rows) * 100)
    : 0

  return (
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
          <Button variant="outline" onClick={onReset}>
            Upload Another File
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
