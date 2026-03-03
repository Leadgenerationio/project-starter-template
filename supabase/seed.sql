-- Demo Seed Data
-- Run: psql $DATABASE_URL -f supabase/seed.sql
-- Prerequisite: Register a user via /register first, then run this script.
-- It picks the first org in the database and seeds data into it.

DO $$
DECLARE
  v_org_id UUID;
  v_buyer1 UUID;
  v_buyer2 UUID;
  v_buyer3 UUID;
  v_buyer4 UUID;
BEGIN
  -- Get the first org (created during registration)
  SELECT id INTO v_org_id FROM organizations LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No organization found. Register a user at /register first.';
  END IF;

  -- Clean existing demo data (idempotent)
  DELETE FROM lead_sales WHERE org_id = v_org_id;
  DELETE FROM orders WHERE org_id = v_org_id;
  DELETE FROM leads WHERE org_id = v_org_id;
  DELETE FROM buyers WHERE org_id = v_org_id;
  DELETE FROM notifications WHERE org_id = v_org_id;

  -- Buyers
  INSERT INTO buyers (id, org_id, company_name, contact_name, email, phone, is_active)
  VALUES
    (gen_random_uuid(), v_org_id, 'Acme Insurance', 'John Smith', 'john@acme.com', '020 7123 4567', true),
    (gen_random_uuid(), v_org_id, 'BrightPath Finance', 'Sarah Jones', 'sarah@brightpath.com', '020 7890 1234', true),
    (gen_random_uuid(), v_org_id, 'SecureLife Ltd', 'Mike Brown', 'mike@securelife.com', '020 7456 7890', true),
    (gen_random_uuid(), v_org_id, 'QuickCover Direct', 'Emma Wilson', 'emma@quickcover.com', NULL, false)
  RETURNING id INTO v_buyer1;

  -- Get buyer IDs for lead_sales
  SELECT id INTO v_buyer1 FROM buyers WHERE org_id = v_org_id AND company_name = 'Acme Insurance';
  SELECT id INTO v_buyer2 FROM buyers WHERE org_id = v_org_id AND company_name = 'BrightPath Finance';
  SELECT id INTO v_buyer3 FROM buyers WHERE org_id = v_org_id AND company_name = 'SecureLife Ltd';
  SELECT id INTO v_buyer4 FROM buyers WHERE org_id = v_org_id AND company_name = 'QuickCover Direct';

  -- Leads: mix of statuses and ages
  -- New leads (0-14 days old)
  INSERT INTO leads (org_id, first_name, last_name, email, phone, postcode, product, source, status, original_buyer_id, created_at)
  VALUES
    (v_org_id, 'Alice', 'Johnson', 'alice@example.com', '07700 900001', 'SW1A 1AA', 'Life Insurance', 'Website', 'new', v_buyer1, now() - interval '2 days'),
    (v_org_id, 'Bob', 'Williams', 'bob@example.com', '07700 900002', 'EC1A 1BB', 'Home Insurance', 'Referral', 'new', v_buyer1, now() - interval '5 days'),
    (v_org_id, 'Charlie', 'Brown', 'charlie@example.com', '07700 900003', 'W1A 0AX', 'Auto Insurance', 'Website', 'new', v_buyer2, now() - interval '8 days'),
    (v_org_id, 'Diana', 'Ross', 'diana@example.com', NULL, 'N1 9GU', 'Health Insurance', 'Social Media', 'new', v_buyer2, now() - interval '12 days');

  -- Aging leads (15-29 days old)
  INSERT INTO leads (org_id, first_name, last_name, email, phone, postcode, product, source, status, original_buyer_id, created_at)
  VALUES
    (v_org_id, 'Edward', 'Norton', 'edward@example.com', '07700 900005', 'SE1 7PB', 'Life Insurance', 'Email Campaign', 'aging', v_buyer1, now() - interval '18 days'),
    (v_org_id, 'Fiona', 'Apple', 'fiona@example.com', '07700 900006', 'E1 6AN', 'Mortgage', 'Partner', 'aging', v_buyer3, now() - interval '22 days'),
    (v_org_id, 'George', 'Martin', 'george@example.com', NULL, 'SW1A 1AA', 'Personal Loan', 'Cold Call', 'aging', v_buyer1, now() - interval '25 days'),
    (v_org_id, 'Hannah', 'Baker', 'hannah@example.com', '07700 900008', 'EC1A 1BB', 'Home Insurance', 'Event', 'aging', v_buyer2, now() - interval '28 days');

  -- Eligible leads (30+ days old)
  INSERT INTO leads (org_id, first_name, last_name, email, phone, postcode, product, source, status, original_buyer_id, created_at)
  VALUES
    (v_org_id, 'Ian', 'Fleming', 'ian@example.com', '07700 900009', 'W1A 0AX', 'Life Insurance', 'Website', 'eligible', v_buyer1, now() - interval '35 days'),
    (v_org_id, 'Jane', 'Austen', 'jane@example.com', '07700 900010', 'N1 9GU', 'Home Insurance', 'Referral', 'eligible', v_buyer2, now() - interval '40 days'),
    (v_org_id, 'Kevin', 'Hart', 'kevin@example.com', NULL, 'SE1 7PB', 'Auto Insurance', 'Social Media', 'eligible', v_buyer3, now() - interval '45 days'),
    (v_org_id, 'Laura', 'Palmer', 'laura@example.com', '07700 900012', 'E1 6AN', 'Health Insurance', 'Website', 'eligible', v_buyer1, now() - interval '50 days'),
    (v_org_id, 'Michael', 'Scott', 'michael@example.com', '07700 900013', 'SW1A 1AA', 'Mortgage', 'Email Campaign', 'eligible', v_buyer2, now() - interval '55 days'),
    (v_org_id, 'Nancy', 'Drew', 'nancy@example.com', '07700 900014', 'EC1A 1BB', 'Personal Loan', 'Partner', 'eligible', v_buyer3, now() - interval '60 days');

  -- Resold leads (previously sold via orders)
  INSERT INTO leads (org_id, first_name, last_name, email, phone, postcode, product, source, status, original_buyer_id, resale_count, total_revenue, created_at)
  VALUES
    (v_org_id, 'Oscar', 'Wilde', 'oscar@example.com', '07700 900015', 'W1A 0AX', 'Life Insurance', 'Website', 'resold', v_buyer1, 1, 5.00, now() - interval '70 days'),
    (v_org_id, 'Patricia', 'Highsmith', 'patricia@example.com', '07700 900016', 'N1 9GU', 'Home Insurance', 'Referral', 'resold', v_buyer2, 2, 10.00, now() - interval '80 days'),
    (v_org_id, 'Quentin', 'Blake', 'quentin@example.com', NULL, 'SE1 7PB', 'Auto Insurance', 'Cold Call', 'resold', v_buyer1, 1, 7.50, now() - interval '90 days');

  -- Orders (one confirmed, one downloaded)
  INSERT INTO orders (org_id, buyer_id, product_filter, postcode_filters, price_per_lead, lead_count, total_amount, status, created_at)
  VALUES
    (v_org_id, v_buyer2, 'Life Insurance', ARRAY['SW1A 1AA', 'W1A 0AX'], 5.00, 1, 5.00, 'confirmed', now() - interval '10 days'),
    (v_org_id, v_buyer3, NULL, ARRAY[]::TEXT[], 7.50, 2, 15.00, 'downloaded', now() - interval '5 days');

  -- Lead sales for the resold leads
  INSERT INTO lead_sales (org_id, lead_id, buyer_id, sale_type, price)
  SELECT v_org_id, l.id, v_buyer2, 'resale', 5.00
  FROM leads l WHERE l.email = 'oscar@example.com' AND l.org_id = v_org_id;

  INSERT INTO lead_sales (org_id, lead_id, buyer_id, sale_type, price)
  SELECT v_org_id, l.id, v_buyer3, 'resale', 5.00
  FROM leads l WHERE l.email = 'patricia@example.com' AND l.org_id = v_org_id;

  INSERT INTO lead_sales (org_id, lead_id, buyer_id, sale_type, price)
  SELECT v_org_id, l.id, v_buyer1, 'resale', 5.00
  FROM leads l WHERE l.email = 'patricia@example.com' AND l.org_id = v_org_id;

  INSERT INTO lead_sales (org_id, lead_id, buyer_id, sale_type, price)
  SELECT v_org_id, l.id, v_buyer3, 'resale', 7.50
  FROM leads l WHERE l.email = 'quentin@example.com' AND l.org_id = v_org_id;

  -- Notifications
  INSERT INTO notifications (org_id, type, title, message, read, created_at)
  VALUES
    (v_org_id, 'info', 'Welcome to LeadVault', 'Your organization has been set up. Start by adding leads or buyers.', true, now() - interval '30 days'),
    (v_org_id, 'success', '6 leads now eligible', '6 leads have passed the 30-day aging window and are ready for resale.', false, now() - interval '2 days'),
    (v_org_id, 'info', 'New team member', 'demo@leadvault.com joined the organization.', true, now() - interval '25 days'),
    (v_org_id, 'success', 'Order confirmed', '2 leads sold to SecureLife Ltd for £15.00.', false, now() - interval '5 days');

  RAISE NOTICE 'Seed data created for org %', v_org_id;
END $$;
