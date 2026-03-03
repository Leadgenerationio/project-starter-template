import * as XLSX from 'xlsx'

export interface ParsedRow {
  first_name: string
  last_name: string
  email: string
  phone?: string
  postcode: string
  product: string
  source?: string
}

const HEADER_MAP: Record<string, string> = {
  'first name': 'first_name',
  'firstname': 'first_name',
  'first_name': 'first_name',
  'last name': 'last_name',
  'lastname': 'last_name',
  'last_name': 'last_name',
  'email': 'email',
  'email address': 'email',
  'phone': 'phone',
  'telephone': 'phone',
  'phone number': 'phone',
  'postcode': 'postcode',
  'post code': 'postcode',
  'zip': 'postcode',
  'zip code': 'postcode',
  'product': 'product',
  'product type': 'product',
  'source': 'source',
  'lead source': 'source',
}

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
