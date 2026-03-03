-- Function to calculate lead age in days
CREATE OR REPLACE FUNCTION lead_age_days(lead_created_at TIMESTAMPTZ)
RETURNS INTEGER AS $$
BEGIN
  RETURN EXTRACT(DAY FROM (now() - lead_created_at))::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update lead statuses based on age
CREATE OR REPLACE FUNCTION update_lead_statuses()
RETURNS void AS $$
BEGIN
  -- New → Aging (15-29 days)
  UPDATE leads
  SET status = 'aging', updated_at = now()
  WHERE status = 'new'
    AND lead_age_days(created_at) >= 15;

  -- Aging → Eligible (30+ days)
  UPDATE leads
  SET status = 'eligible', updated_at = now()
  WHERE status = 'aging'
    AND lead_age_days(created_at) >= 30;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Dashboard stats function
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_org_id UUID)
RETURNS TABLE (
  total_leads BIGINT,
  eligible_leads BIGINT,
  aging_leads BIGINT,
  total_revenue NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_leads,
    COUNT(*) FILTER (WHERE l.status = 'eligible')::BIGINT AS eligible_leads,
    COUNT(*) FILTER (WHERE l.status = 'aging')::BIGINT AS aging_leads,
    COALESCE(SUM(l.total_revenue), 0)::NUMERIC AS total_revenue
  FROM leads l
  WHERE l.org_id = p_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
