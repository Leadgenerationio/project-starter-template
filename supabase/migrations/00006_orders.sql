-- Orders table - resale order groups
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES buyers(id) ON DELETE RESTRICT,
  product_filter TEXT,
  postcode_filters TEXT[] DEFAULT '{}',
  price_per_lead NUMERIC(10,2) NOT NULL,
  lead_count INTEGER NOT NULL DEFAULT 0,
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'downloaded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_org_id ON orders(org_id);
CREATE INDEX idx_orders_buyer_id ON orders(buyer_id);
CREATE INDEX idx_orders_status ON orders(org_id, status);

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view orders"
  ON orders FOR SELECT
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "Members can create orders"
  ON orders FOR INSERT
  WITH CHECK (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "Members can update orders"
  ON orders FOR UPDATE
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "Admins can delete orders"
  ON orders FOR DELETE
  USING (org_id IN (
    SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
  ));
