-- Make storage_path nullable for inline imports (no file stored)
ALTER TABLE import_jobs ALTER COLUMN storage_path DROP NOT NULL;
