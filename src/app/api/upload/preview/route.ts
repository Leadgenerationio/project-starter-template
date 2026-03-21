export const maxDuration = 120

import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'
import * as XLSX from 'xlsx'

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase } = auth
  const { chunk_paths } = await request.json()

  if (!chunk_paths || !Array.isArray(chunk_paths) || chunk_paths.length === 0) {
    return NextResponse.json({ error: 'No file chunks provided' }, { status: 400 })
  }

  // Download and reassemble chunks
  try {
    const chunks: ArrayBuffer[] = []
    for (const path of chunk_paths) {
      const { data, error } = await supabase.storage.from('imports').download(path)
      if (error || !data) {
        return NextResponse.json({ error: `Failed to download chunk` }, { status: 500 })
      }
      chunks.push(await data.arrayBuffer())
    }

    const totalSize = chunks.reduce((sum, c) => sum + c.byteLength, 0)
    const combined = new Uint8Array(totalSize)
    let offset = 0
    for (const chunk of chunks) {
      combined.set(new Uint8Array(chunk), offset)
      offset += chunk.byteLength
    }

    // Parse workbook
    const workbook = XLSX.read(combined.buffer, { type: 'array', cellDates: true })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]

    // Get raw arrays to find the header row
    const rawArrays = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

    if (rawArrays.length === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 })
    }

    // Find header row: first row with 3+ non-empty cells
    let headerRowIdx = 0
    for (let i = 0; i < Math.min(rawArrays.length, 20); i++) {
      const row = rawArrays[i] as unknown[]
      const nonEmpty = row.filter((c) => c !== null && c !== undefined && String(c).trim() !== '').length
      if (nonEmpty >= 3) {
        headerRowIdx = i
        break
      }
    }

    const headers = (rawArrays[headerRowIdx] as unknown[]).map((h) => String(h ?? '').trim())

    // Get 5 sample data rows after the header
    const sampleRows: string[][] = []
    for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 6, rawArrays.length); i++) {
      const row = rawArrays[i] as unknown[]
      sampleRows.push(headers.map((_, colIdx) => String(row[colIdx] ?? '').trim()))
    }

    const totalRows = rawArrays.length - headerRowIdx - 1

    return NextResponse.json({
      headers,
      sample_rows: sampleRows,
      total_rows: totalRows,
      sheet_name: sheetName,
      header_row: headerRowIdx + 1,
    })
  } catch (err) {
    console.error('Preview parse error:', err)
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 500 })
  }
}
