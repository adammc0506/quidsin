-- Tab & Tally retention: every group is deleted after 30 days (or 90 if chosen at creation).
-- A daily Cron Trigger removes expired groups; the API also refuses them straight away.

ALTER TABLE groups ADD COLUMN expires_at TEXT;
ALTER TABLE groups ADD COLUMN extended INTEGER NOT NULL DEFAULT 0;

-- Groups that already exist get a fresh 30 days from now.
UPDATE groups SET expires_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+30 days') WHERE expires_at IS NULL;

CREATE INDEX groups_expires ON groups(expires_at);
