-- API Keys for external lead ingest
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_api_keys_org_id ON api_keys(org_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);

-- RLS
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view api keys"
  ON api_keys FOR SELECT
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "Admins can create api keys"
  ON api_keys FOR INSERT
  WITH CHECK (org_id IN (
    SELECT om.org_id FROM org_members om
    WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
  ));

CREATE POLICY "Admins can update api keys"
  ON api_keys FOR UPDATE
  USING (org_id IN (
    SELECT om.org_id FROM org_members om
    WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
  ));

CREATE POLICY "Admins can delete api keys"
  ON api_keys FOR DELETE
  USING (org_id IN (
    SELECT om.org_id FROM org_members om
    WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
  ));
