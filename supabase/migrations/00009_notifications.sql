-- Notifications for in-app alerts
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);
CREATE INDEX idx_notifications_org ON notifications(org_id, created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their notifications"
  ON notifications FOR SELECT
  USING (
    user_id = auth.uid() OR
    (user_id IS NULL AND org_id IN (SELECT public.get_user_org_ids()))
  );

CREATE POLICY "Users can update their notifications"
  ON notifications FOR UPDATE
  USING (
    user_id = auth.uid() OR
    (user_id IS NULL AND org_id IN (SELECT public.get_user_org_ids()))
  );
