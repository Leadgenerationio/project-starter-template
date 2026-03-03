-- Enable pg_cron extension (requires Supabase dashboard to enable first)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule hourly lead status updates
-- Run this in the Supabase SQL editor after enabling pg_cron:
-- SELECT cron.schedule(
--   'update-lead-statuses',
--   '0 * * * *',
--   'SELECT update_lead_statuses()'
-- );

-- For local development, the lead-aging agent script handles this
COMMENT ON FUNCTION update_lead_statuses IS 'Called hourly by pg_cron in production or lead-aging agent in development';
