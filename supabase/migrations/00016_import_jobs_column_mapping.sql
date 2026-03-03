-- Add column_mapping JSONB to import_jobs for user-defined column mappings
ALTER TABLE import_jobs ADD COLUMN IF NOT EXISTS column_mapping JSONB DEFAULT NULL;

COMMENT ON COLUMN import_jobs.column_mapping IS 'User-defined mapping of LeadVault field keys to CSV column headers';
