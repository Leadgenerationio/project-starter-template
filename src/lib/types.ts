import type { LeadStatus, OrderStatus, OrgRole, Product, LeadSource } from './constants'

export interface Organization {
  id: string
  name: string
  slug: string
  created_at: string
  updated_at: string
}

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  created_at: string
  user_email?: string
}

export interface OrgInvite {
  id: string
  org_id: string
  email: string
  role: OrgRole
  token: string
  expires_at: string
  created_at: string
}

export interface Buyer {
  id: string
  org_id: string
  company_name: string
  contact_name: string
  email: string
  phone: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  total_leads_purchased?: number
  total_spent?: number
}

export interface Lead {
  id: string
  org_id: string
  first_name: string
  last_name: string
  email: string
  phone: string | null
  postcode: string
  product: Product
  source: LeadSource
  original_buyer_id: string | null
  status: LeadStatus
  resale_count: number
  total_revenue: number
  created_at: string
  updated_at: string
  original_buyer?: Buyer
  age_days?: number
}

export interface Order {
  id: string
  org_id: string
  buyer_id: string
  product_filter: Product | null
  postcode_filters: string[]
  price_per_lead: number
  lead_count: number
  total_amount: number
  status: OrderStatus
  created_at: string
  updated_at: string
  buyer?: Buyer
}

export interface LeadSale {
  id: string
  org_id: string
  lead_id: string
  buyer_id: string
  order_id: string
  sale_type: 'original' | 'resale'
  price: number
  created_at: string
  lead?: Lead
  buyer?: Buyer
}

export interface ImportJob {
  id: string
  org_id: string
  user_id: string
  filename: string
  storage_path: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  total_rows: number
  processed_rows: number
  success_count: number
  error_count: number
  errors: ImportError[] | null
  column_mapping: ColumnMapping | null
  created_at: string
  updated_at: string
}

/** Maps LeadVault field key → CSV column header chosen by user */
export type ColumnMapping = Record<string, string>

export interface PreviewResponse {
  storage_path: string
  filename: string
  headers: string[]
  sample_rows: Record<string, string>[]
  suggested_mapping: ColumnMapping
  total_rows: number
}

export interface ImportError {
  row: number
  field: string
  message: string
}

export interface Notification {
  id: string
  org_id: string
  user_id: string | null
  type: 'import_complete' | 'leads_eligible' | 'order_confirmed' | 'invite_received' | 'info'
  title: string
  message: string
  read: boolean
  created_at: string
}

export interface DashboardStats {
  total_leads: number
  eligible_leads: number
  aging_leads: number
  total_revenue: number
}

export interface PaginatedResponse<T> {
  data: T[]
  count: number
  page: number
  pageSize: number
  totalPages: number
}
