import * as XLSX from 'xlsx'
import type { ColumnMapping } from '@/lib/types'

/** Prefix for fixed values in column mapping (not mapped to a CSV column) */
export const FIXED_VALUE_PREFIX = '__fixed__:'

export interface ParsedRow {
  first_name: string
  last_name: string
  email: string
  phone?: string
  postcode: string
  product: string
  source?: string
}

export interface LeadVaultField {
  key: string
  label: string
  required: boolean
}

export const LEADVAULT_FIELDS: LeadVaultField[] = [
  { key: 'first_name', label: 'First Name', required: true },
  { key: 'last_name', label: 'Last Name', required: true },
  { key: 'email', label: 'Email', required: true },
  { key: 'phone', label: 'Phone', required: false },
  { key: 'postcode', label: 'Postcode', required: true },
  { key: 'product', label: 'Product', required: true },
  { key: 'source', label: 'Source', required: false },
]

const HEADER_MAP: Record<string, string> = {
  'first name': 'first_name',
  'firstname': 'first_name',
  'first_name': 'first_name',
  'forename': 'first_name',
  'given name': 'first_name',
  'last name': 'last_name',
  'lastname': 'last_name',
  'last_name': 'last_name',
  'surname': 'last_name',
  'family name': 'last_name',
  'email': 'email',
  'email address': 'email',
  'e-mail': 'email',
  'phone': 'phone',
  'telephone': 'phone',
  'phone number': 'phone',
  'mobile': 'phone',
  'cell': 'phone',
  'tel': 'phone',
  'postcode': 'postcode',
  'post code': 'postcode',
  'zip': 'postcode',
  'zip code': 'postcode',
  'zipcode': 'postcode',
  'postal code': 'postcode',
  'product': 'product',
  'product type': 'product',
  'product_type': 'product',
  'source': 'source',
  'lead source': 'source',
  'lead_source': 'source',
}

export interface ParsedHeaders {
  headers: string[]
  sampleRows: Record<string, string>[]
  totalRows: number
}

/** Parse only headers and first N sample rows without full data processing */
export function parseExcelHeaders(buffer: ArrayBuffer, sampleCount = 5): ParsedHeaders {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

  const headers = rawData.length > 0 ? Object.keys(rawData[0]) : []
  const sampleRows = rawData.slice(0, sampleCount).map((row) => {
    const stringified: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      stringified[key] = String(value ?? '').trim()
    }
    return stringified
  })

  return { headers, sampleRows, totalRows: rawData.length }
}

/** Fuzzy-match CSV headers to LeadVault fields using the HEADER_MAP */
export function suggestMapping(csvHeaders: string[]): ColumnMapping {
  const mapping: ColumnMapping = {}

  for (const field of LEADVAULT_FIELDS) {
    // Try exact and fuzzy matches from HEADER_MAP
    for (const header of csvHeaders) {
      const normalized = header.toLowerCase().trim()
      const mappedTo = HEADER_MAP[normalized]
      if (mappedTo === field.key) {
        mapping[field.key] = header
        break
      }
    }

    // If not found in HEADER_MAP, try substring match as fallback
    if (!mapping[field.key]) {
      const fieldWords = field.key.replace(/_/g, ' ').toLowerCase()
      for (const header of csvHeaders) {
        const normalized = header.toLowerCase().trim()
        if (normalized.includes(fieldWords) || fieldWords.includes(normalized)) {
          mapping[field.key] = header
          break
        }
      }
    }
  }

  return mapping
}

/** Parse file applying user-chosen column mapping instead of HEADER_MAP */
export function applyColumnMapping(buffer: ArrayBuffer, mapping: ColumnMapping): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

  // Separate fixed values from column mappings
  const fixedValues: Record<string, string> = {}
  const reverseMap: Record<string, string> = {}
  for (const [fieldKey, value] of Object.entries(mapping)) {
    if (value.startsWith(FIXED_VALUE_PREFIX)) {
      fixedValues[fieldKey] = value.slice(FIXED_VALUE_PREFIX.length)
    } else if (value) {
      reverseMap[value] = fieldKey
    }
  }

  return rawData.map((row) => {
    const mapped: Record<string, string> = { ...fixedValues }
    for (const [key, value] of Object.entries(row)) {
      const targetField = reverseMap[key]
      if (targetField) {
        mapped[targetField] = String(value ?? '').trim()
      }
    }
    return mapped as unknown as ParsedRow
  })
}

/** Original parser using hardcoded HEADER_MAP (backwards compatible) */
export function parseExcelBuffer(buffer: ArrayBuffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

  return rawData.map((row) => {
    const mapped: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key.toLowerCase().trim()
      const mappedKey = HEADER_MAP[normalizedKey] || normalizedKey
      mapped[mappedKey] = String(value ?? '').trim()
    }
    return mapped as unknown as ParsedRow
  })
}
