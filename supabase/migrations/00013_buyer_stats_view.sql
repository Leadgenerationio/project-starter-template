-- View for buyer stats to avoid N+1 queries
CREATE OR REPLACE VIEW buyer_stats AS
SELECT
  b.id AS buyer_id,
  b.org_id,
  COUNT(ls.id)::INTEGER AS total_leads_purchased,
  COALESCE(SUM(ls.price), 0)::NUMERIC(10,2) AS total_spent
FROM buyers b
LEFT JOIN lead_sales ls ON ls.buyer_id = b.id AND ls.org_id = b.org_id
GROUP BY b.id, b.org_id;
