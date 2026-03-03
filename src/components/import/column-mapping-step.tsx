'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Loader2, ArrowRight, X, Plus } from 'lucide-react'
import { LEADVAULT_FIELDS, FIXED_VALUE_PREFIX } from '@/lib/utils/excel-parser'
import { PRODUCTS, LEAD_SOURCES } from '@/lib/constants'
import type { ColumnMapping, PreviewResponse, Buyer } from '@/lib/types'

interface ColumnMappingStepProps {
  preview: PreviewResponse
  buyers: Buyer[]
  onConfirm: (mapping: ColumnMapping, buyerId: string | null) => void
  onCancel: () => void
  importing: boolean
}

const UNMAPPED = '__unmapped__'
const FIXED = '__fixed_select__'
const CREATE_NEW_BUYER = '__create_new__'

/** Fields that have a known set of valid values */
const FIELD_OPTIONS: Record<string, readonly string[]> = {
  product: PRODUCTS,
  source: LEAD_SOURCES,
}

export function ColumnMappingStep({ preview, buyers, onConfirm, onCancel, importing }: ColumnMappingStepProps) {
  const [mapping, setMapping] = useState<ColumnMapping>(() => {
    const initial: ColumnMapping = {}
    for (const field of LEADVAULT_FIELDS) {
      initial[field.key] = preview.suggested_mapping[field.key] || ''
    }
    return initial
  })

  // Buyer selection state
  const [buyerMode, setBuyerMode] = useState<'none' | 'existing' | 'create'>('none')
  const [selectedBuyerId, setSelectedBuyerId] = useState<string>('')
  const [newBuyerName, setNewBuyerName] = useState('')
  const [newBuyerContact, setNewBuyerContact] = useState('')
  const [newBuyerEmail, setNewBuyerEmail] = useState('')
  const [creatingBuyer, setCreatingBuyer] = useState(false)
  const [createdBuyer, setCreatedBuyer] = useState<Buyer | null>(null)

  // Track which fields are in "fixed value" mode
  const [fixedMode, setFixedMode] = useState<Record<string, boolean>>({})

  const usedHeaders = useMemo(() => {
    const used = new Set<string>()
    for (const value of Object.values(mapping)) {
      if (value && !value.startsWith(FIXED_VALUE_PREFIX)) used.add(value)
    }
    return used
  }, [mapping])

  const requiredMissing = useMemo(() => {
    return LEADVAULT_FIELDS
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
    if (selectValue === FIXED) {
      setFixedMode((prev) => ({ ...prev, [fieldKey]: true }))
      setMapping((prev) => ({ ...prev, [fieldKey]: '' }))
    } else if (selectValue === UNMAPPED) {
      setFixedMode((prev) => ({ ...prev, [fieldKey]: false }))
      setMapping((prev) => ({ ...prev, [fieldKey]: '' }))
    } else {
      setFixedMode((prev) => ({ ...prev, [fieldKey]: false }))
      setMapping((prev) => ({ ...prev, [fieldKey]: selectValue }))
    }
  }

  function handleFixedValueChange(fieldKey: string, value: string) {
    setMapping((prev) => ({
      ...prev,
      [fieldKey]: value ? `${FIXED_VALUE_PREFIX}${value}` : '',
    }))
  }

  function handleBuyerSelectChange(value: string) {
    if (value === CREATE_NEW_BUYER) {
      setBuyerMode('create')
      setSelectedBuyerId('')
    } else if (value === '') {
      setBuyerMode('none')
      setSelectedBuyerId('')
    } else {
      setBuyerMode('existing')
      setSelectedBuyerId(value)
    }
  }

  async function handleCreateBuyer() {
    if (!newBuyerName.trim() || !newBuyerContact.trim() || !newBuyerEmail.trim()) return
    setCreatingBuyer(true)
    try {
      const res = await fetch('/api/buyers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: newBuyerName.trim(),
          contact_name: newBuyerContact.trim(),
          email: newBuyerEmail.trim(),
          is_active: true,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to create buyer')
      }
      const buyer = await res.json() as Buyer
      setCreatedBuyer(buyer)
      setSelectedBuyerId(buyer.id)
      setBuyerMode('existing')
    } catch {
      // Stay in create mode on failure
    } finally {
      setCreatingBuyer(false)
    }
  }

  function getEffectiveBuyerId(): string | null {
    if (buyerMode === 'existing' && selectedBuyerId) return selectedBuyerId
    return null
  }

  // Build preview rows mapped through current mapping
  const mappedPreviewRows = useMemo(() => {
    return preview.sample_rows.map((row) => {
      const mapped: Record<string, string> = {}
      for (const field of LEADVAULT_FIELDS) {
        const value = mapping[field.key]
        if (value?.startsWith(FIXED_VALUE_PREFIX)) {
          mapped[field.key] = value.slice(FIXED_VALUE_PREFIX.length)
        } else if (value) {
          mapped[field.key] = row[value] ?? ''
        } else {
          mapped[field.key] = ''
        }
      }
      return mapped
    })
  }, [preview.sample_rows, mapping])

  // Merge buyers list with any just-created buyer
  const allBuyers = useMemo(() => {
    if (createdBuyer && !buyers.find((b) => b.id === createdBuyer.id)) {
      return [createdBuyer, ...buyers]
    }
    return buyers
  }, [buyers, createdBuyer])

  return (
    <div className="space-y-6">
      {/* Buyer assignment */}
      <Card>
        <CardHeader>
          <CardTitle>Assign Buyer (Optional)</CardTitle>
          <CardDescription>
            Assign these leads to a buyer, or create a new one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select
            value={buyerMode === 'create' ? CREATE_NEW_BUYER : selectedBuyerId}
            onChange={(e) => handleBuyerSelectChange(e.target.value)}
          >
            <option value="">No buyer (assign later)</option>
            <option value={CREATE_NEW_BUYER}>+ Create new buyer</option>
            {allBuyers.map((buyer) => (
              <option key={buyer.id} value={buyer.id}>
                {buyer.company_name} ({buyer.contact_name})
              </option>
            ))}
          </Select>

          {buyerMode === 'create' && (
            <div className="space-y-3 rounded-md border p-4">
              <div className="space-y-1.5">
                <Label htmlFor="buyer-company">Company Name</Label>
                <Input
                  id="buyer-company"
                  value={newBuyerName}
                  onChange={(e) => setNewBuyerName(e.target.value)}
                  placeholder="e.g. Acme Solar Ltd"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="buyer-contact">Contact Name</Label>
                <Input
                  id="buyer-contact"
                  value={newBuyerContact}
                  onChange={(e) => setNewBuyerContact(e.target.value)}
                  placeholder="e.g. John Smith"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="buyer-email">Email</Label>
                <Input
                  id="buyer-email"
                  type="email"
                  value={newBuyerEmail}
                  onChange={(e) => setNewBuyerEmail(e.target.value)}
                  placeholder="e.g. john@acmesolar.com"
                />
              </div>
              <Button
                size="sm"
                onClick={handleCreateBuyer}
                disabled={creatingBuyer || !newBuyerName.trim() || !newBuyerContact.trim() || !newBuyerEmail.trim()}
              >
                {creatingBuyer ? (
                  <><Loader2 className="h-3 w-3 mr-2 animate-spin" /> Creating...</>
                ) : (
                  <><Plus className="h-3 w-3 mr-2" /> Create Buyer</>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Column mapping */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Map Columns</span>
            <Badge variant="secondary">{preview.total_rows} rows</Badge>
          </CardTitle>
          <CardDescription>
            Map your file&apos;s columns to LeadVault fields, or set a fixed value for all rows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {LEADVAULT_FIELDS.map((field) => {
            const currentValue = mapping[field.key]
            const isFixed = fixedMode[field.key]
            const isDuplicate = currentValue && !currentValue.startsWith(FIXED_VALUE_PREFIX) && duplicates.has(currentValue)
            const options = FIELD_OPTIONS[field.key]

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
                <div className="flex-1 flex gap-2">
                  {isFixed ? (
                    <>
                      {options ? (
                        <Select
                          value={currentValue?.startsWith(FIXED_VALUE_PREFIX) ? currentValue.slice(FIXED_VALUE_PREFIX.length) : ''}
                          onChange={(e) => handleFixedValueChange(field.key, e.target.value)}
                          className="flex-1"
                        >
                          <option value="">-- Select value --</option>
                          {options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          value={currentValue?.startsWith(FIXED_VALUE_PREFIX) ? currentValue.slice(FIXED_VALUE_PREFIX.length) : ''}
                          onChange={(e) => handleFixedValueChange(field.key, e.target.value)}
                          placeholder={`Enter ${field.label.toLowerCase()}...`}
                          className="flex-1"
                        />
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleFieldChange(field.key, UNMAPPED)}
                        className="shrink-0 text-muted-foreground"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </>
                  ) : (
                    <Select
                      value={currentValue || UNMAPPED}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      className={`flex-1 ${isDuplicate ? 'border-destructive' : ''}`}
                    >
                      <option value={UNMAPPED}>-- Select column --</option>
                      <option value={FIXED}>Set fixed value for all rows</option>
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
                    </Select>
                  )}
                </div>
              </div>
            )
          })}

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

      {/* Preview */}
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
        <Button onClick={() => onConfirm(mapping, getEffectiveBuyerId())} disabled={!canConfirm || importing}>
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
