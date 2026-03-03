import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

const INTERVAL_MS = 60 * 60 * 1000 // 1 hour
const IMPORT_FILE_MAX_AGE_HOURS = 24

async function updateLeadStatuses() {
  console.log(`[${new Date().toISOString()}] Running lead status updates...`)

  const { error } = await supabase.rpc('update_lead_statuses')

  if (error) {
    console.error('Failed to update lead statuses:', error.message)

    // Fallback: do it manually
    console.log('Falling back to manual status updates...')

    // New → Aging (15+ days)
    const { count: agingCount } = await supabase
      .from('leads')
      .update({ status: 'aging' })
      .eq('status', 'new')
      .lt('created_at', new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString())

    // Aging → Eligible (30+ days)
    const { count: eligibleCount } = await supabase
      .from('leads')
      .update({ status: 'eligible' })
      .eq('status', 'aging')
      .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    console.log(`Updated: ${agingCount ?? 0} → aging, ${eligibleCount ?? 0} → eligible`)

    // Create notifications for newly eligible leads
    if (eligibleCount && eligibleCount > 0) {
      // Get distinct orgs that have newly eligible leads
      const { data: orgs } = await supabase
        .from('leads')
        .select('org_id')
        .eq('status', 'eligible')
        .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .gt('updated_at', new Date(Date.now() - 65 * 60 * 1000).toISOString()) // Updated in last 65 mins

      const uniqueOrgs = [...new Set(orgs?.map((o) => o.org_id) ?? [])]
      for (const orgId of uniqueOrgs) {
        await supabase.from('notifications').insert({
          org_id: orgId,
          type: 'leads_eligible',
          title: 'Leads Now Eligible',
          message: 'New leads have reached 30 days and are now eligible for resale.',
        })
      }
    }
  } else {
    console.log('Lead statuses updated via DB function')
  }
}

async function cleanupImportFiles() {
  console.log(`[${new Date().toISOString()}] Cleaning up old import files...`)

  const cutoff = new Date(Date.now() - IMPORT_FILE_MAX_AGE_HOURS * 60 * 60 * 1000).toISOString()

  const { data: oldJobs } = await supabase
    .from('import_jobs')
    .select('id, storage_path')
    .in('status', ['completed', 'failed'])
    .lt('created_at', cutoff)

  if (oldJobs && oldJobs.length > 0) {
    const paths = oldJobs.map((j) => j.storage_path)
    const { error } = await supabase.storage.from('imports').remove(paths)

    if (error) {
      console.error('Failed to cleanup files:', error.message)
    } else {
      console.log(`Cleaned up ${paths.length} import files`)
    }
  }
}

async function run() {
  console.log('Lead Aging Agent started')
  console.log(`Running every ${INTERVAL_MS / 1000 / 60} minutes`)

  // Run immediately
  await updateLeadStatuses()
  await cleanupImportFiles()

  // Then on interval
  setInterval(async () => {
    await updateLeadStatuses()
    await cleanupImportFiles()
  }, INTERVAL_MS)
}

run().catch(console.error)
