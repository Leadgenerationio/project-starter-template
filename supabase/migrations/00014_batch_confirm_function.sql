-- Batch update leads when an order is confirmed
-- Single SQL call instead of N round trips
CREATE OR REPLACE FUNCTION confirm_order_leads(
  p_lead_ids UUID[],
  p_price_per_lead NUMERIC
)
RETURNS void AS $$
BEGIN
  UPDATE leads
  SET
    status = 'resold',
    resale_count = resale_count + 1,
    total_revenue = total_revenue + p_price_per_lead,
    updated_at = now()
  WHERE id = ANY(p_lead_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
