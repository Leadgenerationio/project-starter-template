-- Upload feature: add columns to leads, make order_id nullable in lead_sales,
-- add unique constraint to prevent duplicate sales.

-- New lead columns for imported file data
ALTER TABLE leads ADD COLUMN IF NOT EXISTS date_received DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ever_sold BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS times_sold INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sold_tag TEXT;

-- Allow lead_sales without an order (historical imports have no order)
ALTER TABLE lead_sales ALTER COLUMN order_id DROP NOT NULL;

-- Prevent selling the same lead to the same buyer twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_sales_lead_buyer_unique
  ON lead_sales(lead_id, buyer_id);
