import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedOrg } from '@/lib/supabase/auth-helpers'
import { leadSchema, leadFilterSchema } from '@/lib/validations/lead'

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const params = Object.fromEntries(request.nextUrl.searchParams)
  const filters = leadFilterSchema.parse(params)

  let query = supabase
    .from('leads')
    .select('*, original_buyer:buyers!leads_original_buyer_id_fkey(id, company_name)', { count: 'exact' })
    .eq('org_id', orgId)

  if (filters.status) query = query.eq('status', filters.status)
  if (filters.product) query = query.eq('product', filters.product)
  if (filters.source) query = query.eq('source', filters.source)
  if (filters.search) {
    query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,postcode.ilike.%${filters.search}%`)
  }

  const from = (filters.page - 1) * filters.pageSize
  const to = from + filters.pageSize - 1

  query = query
    .order(filters.sortBy, { ascending: filters.sortOrder === 'asc' })
    .range(from, to)

  const { data, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    data,
    count: count ?? 0,
    page: filters.page,
    pageSize: filters.pageSize,
    totalPages: Math.ceil((count ?? 0) / filters.pageSize),
  })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedOrg()
  if ('error' in auth) return auth.error

  const { supabase, orgId } = auth
  const body = await request.json()

  const result = leadSchema.safeParse(body)
  if (!result.success) {
    return NextResponse.json({ error: result.error.issues[0].message }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('leads')
    .insert({ ...result.data, org_id: orgId })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
