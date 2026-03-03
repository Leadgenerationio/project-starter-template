'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Loader2, ArrowRight, X, Info } from 'lucide-react'
import { LEADVAULT_FIELDS, FIXED_VALUE_PREFIX, BUYER_STATUS_MARKERS } from '@/lib/utils/excel-parser'
import { PRODUCTS } from '@/lib/constants'
import type { ColumnMapping, PreviewResponse } from '@/lib/types'

export type LeadAge = 'new' | 'eligible'

interface ColumnMappingStepProps {
  preview: PreviewResponse
  onConfirm: (mapping: ColumnMapping, leadAge: LeadAge) => void
  onCancel: () => void
  importing: boolean
}

const UNMAPPED = '__unmapped__'

/** Fields that have fixed value options shown directly in the dropdown */
const FIELD_FIXED_OPTIONS: Record<string, readonly string[]> = {
  product: PRODUCTS,
}

/** Fields that only allow fixed value selection (no CSV column mapping) */
const FIXED_ONLY_FIELDS = new Set(['product'])

/** Fields user can map via dropdown (excludes auto-detect fields like buyer) */
const MAPPABLE_FIELDS = LEADVAULT_FIELDS.filter((f) => !f.autoDetect)

export function ColumnMappingStep({ preview, onConfirm, onCancel, importing }: ColumnMappingStepProps) {
  const [leadAge, setLeadAge] = useState<LeadAge>('new')
  const [mapping, setMapping] = useState<ColumnMapping>(() => {
    const initial: ColumnMapping = {}
    for (const field of MAPPABLE_FIELDS) {
      initial[field.key] = preview.suggested_mapping[field.key] || ''
    }
    return initial
  })

  const usedHeaders = useMemo(() => {
    const used = new Set<string>()
    for (const value of Object.values(mapping)) {
      if (value && !value.startsWith(FIXED_VALUE_PREFIX)) used.add(value)
    }
    return used
  }, [mapping])

  const requiredMissing = useMemo(() => {
    return MAPPABLE_FIELDS
      .filter((f) => f.required && !mapping[f.key])
      .map((f) => f.label)
  }, [mapping])

  const duplicates = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const value of Object.values(mapping)) {
      if (value && !value.startsWith(FIXED_VALUE_PREFIX)) {
        counts[value] = (counts[value] || 0) + 1
      }
    }
    return new Set(Object.keys(counts).filter((k) => counts[k] > 1))
  }, [mapping])

  const canConfirm = requiredMissing.length === 0 && duplicates.size === 0

  function handleFieldChange(fieldKey: string, selectValue: string) {
    setMapping((prev) => ({
      ...prev,
      [fieldKey]: selectValue === UNMAPPED ? '' : selectValue,
    }))
  }

  // Detect unique buyer names from sample rows (unmapped columns with status markers)
  const detectedBuyers = useMemo(() => {
    const buyers = new Set<string>()
    for (const row of preview.sample_rows) {
      for (const [header, cellValue] of Object.entries(row)) {
        if (usedHeaders.has(header)) continue
        if (cellValue && BUYER_STATUS_MARKERS.has(cellValue.toLowerCase())) {
          buyers.add(header)
        }
      }
    }
    return Array.from(buyers).sort()
  }, [preview.sample_rows, usedHeaders])

  // Build preview rows mapped through current mapping + auto-detected buyer
  const mappedPreviewRows = useMemo(() => {
    return preview.sample_rows.map((row) => {
      const mapped: Record<string, string> = {}
      for (const field of MAPPABLE_FIELDS) {
        const value = mapping[field.key]
        if (value?.startsWith(FIXED_VALUE_PREFIX)) {
          mapped[field.key] = value.slice(FIXED_VALUE_PREFIX.length)
        } else if (value) {
          mapped[field.key] = row[value] ?? ''
        } else {
          mapped[field.key] = ''
        }
      }
      // Auto-detect buyer from unmapped columns with status markers
      for (const [header, cellValue] of Object.entries(row)) {
        if (usedHeaders.has(header)) continue
        if (cellValue && BUYER_STATUS_MARKERS.has(cellValue.toLowerCase())) {
          mapped.buyer = header
          break
        }
      }
      if (!mapped.buyer) mapped.buyer = ''
      return mapped
    })
  }, [preview.sample_rows, mapping, usedHeaders])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Map Columns</span>
            <Badge variant="secondary">{preview.total_rows} rows</Badge>
          </CardTitle>
          <CardDescription>
            Map your file&apos;s columns to LeadVault fields. Select a product for all rows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {MAPPABLE_FIELDS.map((field) => {
            const currentValue = mapping[field.key]
            const isFixed = currentValue?.startsWith(FIXED_VALUE_PREFIX)
            const isDuplicate = currentValue && !isFixed && duplicates.has(currentValue)
            const fixedOptions = FIELD_FIXED_OPTIONS[field.key]
            const isFixedOnly = FIXED_ONLY_FIELDS.has(field.key)

            return (
              <div key={field.key} className="flex items-center gap-3">
                <div className="w-36 flex items-center gap-2 shrink-0">
                  <span className="text-sm font-medium">{field.label}</span>
                  {field.required && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      Required
                    </Badge>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <Select
                    value={currentValue || UNMAPPED}
                    onChange={(e) => handleFieldChange(field.key, e.target.value)}
                    className={isDuplicate ? 'border-destructive' : ''}
                  >
                    <option value={UNMAPPED}>-- {isFixedOnly ? 'Select' : 'Select column'} --</option>

                    {/* Fixed value options (e.g. product list) */}
                    {fixedOptions && (
                      <optgroup label={`${field.label} Options`}>
                        {fixedOptions.map((opt) => (
                          <option key={opt} value={`${FIXED_VALUE_PREFIX}${opt}`}>
                            {opt}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {/* CSV column options (hidden for fixed-only fields like product) */}
                    {!isFixedOnly && (
                      <optgroup label="CSV Columns">
                        {preview.headers.map((header) => (
                          <option
                            key={header}
                            value={header}
                            disabled={usedHeaders.has(header) && mapping[field.key] !== header}
                          >
                            {header}
                            {usedHeaders.has(header) && mapping[field.key] !== header ? ' (used)' : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                </div>
              </div>
            )
          })}

          {/* Buyer auto-detection info */}
          <div className="flex items-center gap-3">
            <div className="w-36 flex items-center gap-2 shrink-0">
              <span className="text-sm font-medium">Buyer</span>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="flex-1 flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4 shrink-0" />
              {detectedBuyers.length > 0 ? (
                <span>
                  Auto-detected: {detectedBuyers.map((b, i) => (
                    <Badge key={b} variant="secondary" className="mx-0.5">{b}</Badge>
                  ))}
                </span>
              ) : (
                <span>Auto-detected from columns containing &quot;Sold&quot;</span>
              )}
            </div>
          </div>

          <div className="pt-2 border-t">
            <label className="text-sm font-medium block mb-2">Lead Age</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="lead_age"
                  value="new"
                  checked={leadAge === 'new'}
                  onChange={() => setLeadAge('new')}
                  className="accent-primary"
                />
                <span className="text-sm">Under 30 days (New)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="lead_age"
                  value="eligible"
                  checked={leadAge === 'eligible'}
                  onChange={() => setLeadAge('eligible')}
                  className="accent-primary"
                />
                <span className="text-sm">Over 30 days (Eligible to sell)</span>
              </label>
            </div>
          </div>

          {requiredMissing.length > 0 && (
            <p className="text-sm text-destructive">
              Missing required fields: {requiredMissing.join(', ')}
            </p>
          )}
          {duplicates.size > 0 && (
            <p className="text-sm text-destructive">
              Duplicate column mappings: {Array.from(duplicates).join(', ')}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preview (first {preview.sample_rows.length} rows)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {LEADVAULT_FIELDS.map((field) => {
                    if (field.autoDetect) {
                      return (
                        <TableHead key={field.key}>
                          {field.label} (auto)
                        </TableHead>
                      )
                    }
                    const value = mapping[field.key]
                    const isFieldFixed = value?.startsWith(FIXED_VALUE_PREFIX)
                    return (
                      <TableHead key={field.key} className={!value ? 'text-muted-foreground/50' : ''}>
                        {field.label}
                        {!value && ' (unmapped)'}
                        {isFieldFixed && ' (fixed)'}
                      </TableHead>
                    )
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappedPreviewRows.map((row, i) => (
                  <TableRow key={i}>
                    {LEADVAULT_FIELDS.map((field) => {
                      if (field.autoDetect) {
                        return (
                          <TableCell key={field.key} className={row[field.key] ? 'text-green-600' : 'text-muted-foreground/40 italic'}>
                            {row[field.key] || '—'}
                          </TableCell>
                        )
                      }
                      const value = mapping[field.key]
                      const isFieldFixed = value?.startsWith(FIXED_VALUE_PREFIX)
                      return (
                        <TableCell
                          key={field.key}
                          className={
                            !value ? 'text-muted-foreground/40 italic' :
                            isFieldFixed ? 'text-blue-600' : ''
                          }
                        >
                          {row[field.key] || (value ? '-' : '')}
                        </TableCell>
                      )
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={() => onConfirm(mapping, leadAge)} disabled={!canConfirm || importing}>
          {importing ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Importing...</>
          ) : (
            `Import ${preview.total_rows} Rows`
          )}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          <X className="h-4 w-4 mr-2" /> Cancel
        </Button>
      </div>
    </div>
  )
}
