-- Create storage bucket for imports
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('imports', 'imports', false, 10485760)
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "Authenticated users can upload imports"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'imports' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Users can read their org imports"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'imports' AND
    auth.role() = 'authenticated'
  );

CREATE POLICY "Service role can delete imports"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'imports');
