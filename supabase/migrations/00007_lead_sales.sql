-- Lead sales - individual sale records
CREATE TABLE lead_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sale_type TEXT NOT NULL CHECK (sale_type IN ('original', 'resale')),
  price NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_sales_org_id ON lead_sales(org_id);
CREATE INDEX idx_lead_sales_lead_id ON lead_sales(lead_id);
CREATE INDEX idx_lead_sales_buyer_id ON lead_sales(buyer_id);
CREATE INDEX idx_lead_sales_order_id ON lead_sales(order_id);

-- RLS
ALTER TABLE lead_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view lead sales"
  ON lead_sales FOR SELECT
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "Members can create lead sales"
  ON lead_sales FOR INSERT
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));
