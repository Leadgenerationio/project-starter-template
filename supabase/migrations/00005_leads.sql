-- Leads table - core data
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  postcode TEXT NOT NULL,
  product TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'Website',
  original_buyer_id UUID REFERENCES buyers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'aging', 'eligible', 'resold')),
  resale_count INTEGER NOT NULL DEFAULT 0,
  total_revenue NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_leads_org_id ON leads(org_id);
CREATE INDEX idx_leads_status ON leads(org_id, status);
CREATE INDEX idx_leads_product ON leads(org_id, product);
CREATE INDEX idx_leads_postcode ON leads(org_id, postcode);
CREATE INDEX idx_leads_created_at ON leads(org_id, created_at);

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view leads"
  ON leads FOR SELECT
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "Members can create leads"
  ON leads FOR INSERT
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "Members can update leads"
  ON leads FOR UPDATE
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "Admins can delete leads"
  ON leads FOR DELETE
  USING (org_id IN (
    SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
  ));
