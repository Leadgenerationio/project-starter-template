-- Org members for user-organization relationships
CREATE TABLE org_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')) DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, user_id)
);

-- Index for fast lookups
CREATE INDEX idx_org_members_user_id ON org_members(user_id);
CREATE INDEX idx_org_members_org_id ON org_members(org_id);

-- SECURITY DEFINER function to break circular RLS reference
-- org_members policies reference org_members itself, causing infinite recursion
-- This function bypasses RLS to look up the current user's org IDs
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid()
$$;

-- RLS for org_members (uses get_user_org_ids() to avoid infinite recursion)
ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their org members"
  ON org_members FOR SELECT
  USING (org_id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "Admins can insert members"
  ON org_members FOR INSERT
  WITH CHECK (org_id IN (
    SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
  ));

CREATE POLICY "Owners can update members"
  ON org_members FOR UPDATE
  USING (org_id IN (
    SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.role = 'owner'
  ));

CREATE POLICY "Owners can delete members"
  ON org_members FOR DELETE
  USING (org_id IN (
    SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.role = 'owner'
  ));

-- RLS policies for organizations (deferred from 00001 since org_members didn't exist yet)
CREATE POLICY "Users can view their own org"
  ON organizations FOR SELECT
  USING (id IN (SELECT public.get_user_org_ids()));

CREATE POLICY "Owners can update their org"
  ON organizations FOR UPDATE
  USING (id IN (
    SELECT om.org_id FROM org_members om WHERE om.user_id = auth.uid() AND om.role = 'owner'
  ));
