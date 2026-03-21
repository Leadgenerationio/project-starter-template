-- Increase imports bucket file size limit to 1GB for large Excel uploads
UPDATE storage.buckets
SET file_size_limit = 1073741824
WHERE id = 'imports';
