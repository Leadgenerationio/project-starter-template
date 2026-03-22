import { createHash, randomBytes } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from './admin'

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export function generateApiKey(): string {
  return `lv_${randomBytes(24).toString('hex')}`
}

export async function getAuthenticatedOrgByApiKey(
  request: NextRequest
): Promise<{ orgId: string } | { error: NextResponse }> {
  const apiKey = request.headers.get('x-api-key')

  if (!apiKey) {
    return { error: NextResponse.json({ error: 'Missing x-api-key header' }, { status: 401 }) }
  }

  const keyHash = hashApiKey(apiKey)
  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('api_keys')
    .select('id, org_id')
    .eq('key_hash', keyHash)
    .eq('is_active', true)
    .single()

  if (error || !data) {
    return { error: NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 }) }
  }

  // Fire-and-forget: update last_used_at
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then()

  return { orgId: data.org_id }
}
