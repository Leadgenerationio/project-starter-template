'use client'

import { useState, useCallback, useRef } from 'react'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { PRODUCTS } from '@/lib/constants'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X } from 'lucide-react'
import * as XLSX from 'xlsx'

interface UploadSummary {
  newBuyers: number
  existingBuyers: number
  leadsImported: number
  leadsUpdated: number
  salesRecorded: number
  duplicateSalesSkipped: number
  totalRows: number
}

const BATCH_SIZE = 2000

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [product, setProduct] = useState<string>('')
  const [uploading, setUploading] = useState(false)
  const [status, setStatus] = useState('')
  const [summary, setSummary] = useState<UploadSummary | null>(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((f: File) => {
    setError('')
    setSummary(null)

    const ext = f.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      setError('Invalid file type. Please upload an .xlsx, .xls, or .csv file.')
      return
    }

    setFile(f)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const f = e.dataTransfer.files[0]
      if (f) handleFile(f)
    },
    [handleFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  async function handleUpload() {
    if (!file || !product) return

    setUploading(true)
    setError('')
    setSummary(null)

    try {
      // Step 1: Parse file in the browser
      setStatus('Reading file...')
      const buffer = await file.arrayBuffer()
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })

      if (rows.length === 0) {
        setError('File contains no data rows')
        setUploading(false)
        return
      }

      // Step 2: Send rows to API in batches
      const totalBatches = Math.ceil(rows.length / BATCH_SIZE)
      const totals: UploadSummary = {
        newBuyers: 0,
        existingBuyers: 0,
        leadsImported: 0,
        leadsUpdated: 0,
        salesRecorded: 0,
        duplicateSalesSkipped: 0,
        totalRows: rows.length,
      }

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batchNum = Math.floor(i / BATCH_SIZE) + 1
        setStatus(`Processing batch ${batchNum} of ${totalBatches} (${rows.length.toLocaleString()} rows)...`)

        const batch = rows.slice(i, i + BATCH_SIZE)

        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: batch, product }),
        })

        const data = await res.json()

        if (!res.ok) {
          setError(data.error || `Processing failed on batch ${batchNum}`)
          setUploading(false)
          return
        }

        totals.newBuyers += data.newBuyers
        totals.existingBuyers += data.existingBuyers
        totals.leadsImported += data.leadsImported
        totals.leadsUpdated += data.leadsUpdated
        totals.salesRecorded += data.salesRecorded
        totals.duplicateSalesSkipped += data.duplicateSalesSkipped
      }

      setSummary(totals)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      setStatus('')
    }
  }

  function handleReset() {
    setFile(null)
    setProduct('')
    setSummary(null)
    setError('')
    setStatus('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div>
      <PageHeader title="Upload Leads" description="Import leads from an Excel or CSV file" />

      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Select File</CardTitle>
            <CardDescription>
              Upload an Excel (.xlsx, .xls) or CSV file with lead data. Buyers and sales will be extracted automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!file ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors
                  ${dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
                `}
              >
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Drag & drop your file here, or click to browse</p>
                <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls, .csv — no size limit</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) handleFile(f)
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {file.size < 1024 * 1024
                        ? `${(file.size / 1024).toFixed(1)} KB`
                        : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={handleReset} disabled={uploading}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div className="space-y-2">
              <Label>Product</Label>
              <Select
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                disabled={uploading}
              >
                <option value="">Select product for these leads</option>
                {PRODUCTS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </div>

            <Button
              onClick={handleUpload}
              disabled={!file || !product || uploading}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {status || 'Processing...'}
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload & Process
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Upload Failed</p>
                  <p className="text-sm text-muted-foreground mt-1">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {summary && (
          <Card className="border-green-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-green-700">
                <CheckCircle2 className="h-5 w-5" />
                Upload Complete
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <SummaryItem label="Total Rows" value={summary.totalRows} />
                <SummaryItem label="Leads Imported" value={summary.leadsImported} />
                <SummaryItem label="Leads Updated" value={summary.leadsUpdated} />
                <SummaryItem label="New Buyers Created" value={summary.newBuyers} />
                <SummaryItem label="Existing Buyers" value={summary.existingBuyers} />
                <SummaryItem label="Sales Recorded" value={summary.salesRecorded} />
                <SummaryItem label="Duplicate Sales Skipped" value={summary.duplicateSalesSkipped} />
              </div>

              <Button onClick={handleReset} variant="outline" className="mt-6 w-full">
                Upload Another File
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function SummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold">{value.toLocaleString()}</p>
    </div>
  )
}
