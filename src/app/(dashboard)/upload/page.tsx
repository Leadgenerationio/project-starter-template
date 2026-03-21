'use client'

import { useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { PRODUCTS } from '@/lib/constants'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, X, ArrowRight } from 'lucide-react'

const CHUNK_SIZE = 40 * 1024 * 1024

const LEADVAULT_FIELDS = [
  { key: 'first_name', label: 'First Name', required: true },
  { key: 'last_name', label: 'Last Name', required: true },
  { key: 'email', label: 'Email' },
  { key: 'telephone', label: 'Phone' },
  { key: 'postcode', label: 'Postcode', required: true },
  { key: 'buyer', label: 'Buyer (original)' },
  { key: 'sold_1', label: 'Sold 1' },
  { key: 'sold_2', label: 'Sold 2' },
  { key: 'sold_3', label: 'Sold 3' },
  { key: 'sold_4', label: 'Sold 4' },
  { key: 'date_received', label: 'Date Received' },
  { key: 'ever_sold', label: 'Ever Sold?' },
  { key: 'times_sold', label: 'Times Sold' },
  { key: 'sold_tag', label: 'Sold Tag' },
]

/** Try to auto-suggest a mapping based on header name */
const AUTO_MAP: Record<string, string> = {
  'firstname': 'first_name', 'first name': 'first_name', 'first_name': 'first_name', 'forename': 'first_name',
  'lastname': 'last_name', 'last name': 'last_name', 'last_name': 'last_name', 'surname': 'last_name',
  'email': 'email', 'email address': 'email',
  'telephone1': 'telephone', 'telephone': 'telephone', 'phone': 'telephone', 'mobile': 'telephone', 'tel': 'telephone',
  'postcode': 'postcode', 'post code': 'postcode', 'zip': 'postcode', 'zipcode': 'postcode',
  'buyer': 'buyer', 'buyer name': 'buyer',
  'sold 1': 'sold_1', 'sold1': 'sold_1',
  'sold 2': 'sold_2', 'sold2': 'sold_2',
  'sold 3': 'sold_3', 'sold3': 'sold_3',
  'sold 4': 'sold_4', 'sold4': 'sold_4',
  'date received': 'date_received', 'date': 'date_received',
  'ever sold?': 'ever_sold', 'ever sold': 'ever_sold',
  'number of times sold': 'times_sold', 'times sold': 'times_sold',
  'sold tag': 'sold_tag',
}

interface UploadSummary {
  newBuyers: number
  existingBuyers: number
  leadsImported: number
  leadsUpdated: number
  salesRecorded: number
  duplicateSalesSkipped: number
  totalRows: number
}

interface PreviewData {
  headers: string[]
  sample_rows: string[][]
  total_rows: number
  sheet_name: string
  header_row: number
}

type Step = 'select' | 'preview' | 'processing' | 'done'

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [product, setProduct] = useState<string>('')
  const [step, setStep] = useState<Step>('select')
  const [status, setStatus] = useState('')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [chunkPaths, setChunkPaths] = useState<string[]>([])
  const [summary, setSummary] = useState<UploadSummary | null>(null)
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((f: File) => {
    setError('')
    setSummary(null)
    setPreview(null)
    setStep('select')

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

  async function handleUploadAndPreview() {
    if (!file || !product) return

    setStep('processing')
    setError('')

    const supabase = createClient()
    const uploadId = `upload-${Date.now()}`
    const paths: string[] = []

    try {
      // Upload chunks
      const buffer = await file.arrayBuffer()
      const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

      for (let i = 0; i < totalChunks; i++) {
        setStatus(`Uploading chunk ${i + 1} of ${totalChunks}...`)
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, file.size)
        const chunk = buffer.slice(start, end)
        const chunkPath = `${uploadId}/chunk-${String(i).padStart(4, '0')}`

        const { error: uploadError } = await supabase.storage
          .from('imports')
          .upload(chunkPath, chunk, { contentType: 'application/octet-stream' })

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`)
        paths.push(chunkPath)
      }

      setChunkPaths(paths)

      // Get preview
      setStatus('Parsing file...')
      const res = await fetch('/api/upload/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk_paths: paths }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Preview failed')

      setPreview(data)

      // Auto-suggest mapping
      const autoMapping: Record<string, string> = {}
      for (const header of data.headers) {
        const key = header.toLowerCase().trim()
        if (AUTO_MAP[key]) {
          autoMapping[AUTO_MAP[key]] = header
        }
      }
      setMapping(autoMapping)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
      setStep('select')
      if (paths.length > 0) {
        await supabase.storage.from('imports').remove(paths)
      }
    } finally {
      setStatus('')
    }
  }

  async function handleProcess() {
    setStep('processing')
    setStatus('Processing leads, buyers, and sales...')
    setError('')

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chunk_paths: chunkPaths, product, column_mapping: mapping }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Processing failed')

      setSummary(data)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Processing failed')
      setStep('preview')
    } finally {
      setStatus('')
    }
  }

  function handleReset() {
    // Clean up chunks if any
    if (chunkPaths.length > 0) {
      const supabase = createClient()
      supabase.storage.from('imports').remove(chunkPaths)
    }
    setFile(null)
    setProduct('')
    setStep('select')
    setPreview(null)
    setMapping({})
    setChunkPaths([])
    setSummary(null)
    setError('')
    setStatus('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function updateMapping(field: string, header: string) {
    setMapping((prev) => {
      const next = { ...prev }
      if (header) {
        next[field] = header
      } else {
        delete next[field]
      }
      return next
    })
  }

  // Which file headers are already mapped
  const usedHeaders = new Set(Object.values(mapping))

  return (
    <div>
      <PageHeader title="Upload Leads" description="Import leads from an Excel or CSV file" />

      <div className="max-w-3xl space-y-6">
        {/* Step 1: File Select */}
        {step === 'select' && (
          <Card>
            <CardHeader>
              <CardTitle>Select File</CardTitle>
              <CardDescription>
                Upload an Excel or CSV file. You&apos;ll preview the data and map columns before importing.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!file ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={(e) => { e.preventDefault(); setDragOver(false) }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                    dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
                  }`}
                >
                  <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm font-medium">Drag & drop your file here, or click to browse</p>
                  <p className="text-xs text-muted-foreground mt-1">Supports .xlsx, .xls, .csv — no size limit</p>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
                </div>
              ) : (
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-8 w-8 text-green-600" />
                    <div>
                      <p className="text-sm font-medium">{file.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / (1024 * 1024)).toFixed(1)} MB`}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => { setFile(null); if (fileInputRef.current) fileInputRef.current.value = '' }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="space-y-2">
                <Label>Product</Label>
                <Select value={product} onChange={(e) => setProduct(e.target.value)}>
                  <option value="">Select product for these leads</option>
                  {PRODUCTS.map((p) => (<option key={p} value={p}>{p}</option>))}
                </Select>
              </div>

              <Button onClick={handleUploadAndPreview} disabled={!file || !product} className="w-full">
                <ArrowRight className="h-4 w-4 mr-2" />
                Upload & Preview
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {step === 'processing' && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-center gap-3 py-8">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm font-medium">{status || 'Processing...'}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Preview + Mapping */}
        {step === 'preview' && preview && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Preview & Map Columns</CardTitle>
                <CardDescription>
                  Sheet: &quot;{preview.sheet_name}&quot; — {preview.total_rows.toLocaleString()} rows found (header on row {preview.header_row}).
                  Map your file columns to LeadVault fields.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Sample data table */}
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-muted">
                        {preview.headers.map((h, i) => (
                          <th key={i} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h || `(Column ${i + 1})`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.sample_rows.map((row, ri) => (
                        <tr key={ri} className="border-t">
                          {row.map((cell, ci) => (
                            <td key={ci} className="px-3 py-1.5 whitespace-nowrap max-w-[200px] truncate">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Column mapping */}
                <div>
                  <h3 className="text-sm font-semibold mb-3">Column Mapping</h3>
                  <div className="grid gap-3">
                    {LEADVAULT_FIELDS.map((field) => (
                      <div key={field.key} className="flex items-center gap-3">
                        <span className="text-sm w-40 flex-shrink-0">
                          {field.label}
                          {field.required && <span className="text-destructive ml-1">*</span>}
                        </span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                        <Select
                          value={mapping[field.key] || ''}
                          onChange={(e) => updateMapping(field.key, e.target.value)}
                          className="flex-1"
                        >
                          <option value="">— Skip —</option>
                          {preview.headers.map((h, i) => (
                            <option key={i} value={h} disabled={usedHeaders.has(h) && mapping[field.key] !== h}>
                              {h || `(Column ${i + 1})`}
                            </option>
                          ))}
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button onClick={handleProcess} className="flex-1"
                    disabled={!mapping.first_name || !mapping.last_name || !mapping.postcode}>
                    <Upload className="h-4 w-4 mr-2" />
                    Import {preview.total_rows.toLocaleString()} Rows
                  </Button>
                  <Button variant="outline" onClick={handleReset}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* Step 3: Summary */}
        {step === 'done' && summary && (
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
              <Button onClick={handleReset} variant="outline" className="mt-6 w-full">Upload Another File</Button>
            </CardContent>
          </Card>
        )}

        {/* Error */}
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
