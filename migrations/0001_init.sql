-- QuidsIn D1 schema. Applied by `wrangler d1 migrations apply quidsin`.
-- All money is integer pence.

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GBP',
  created_at TEXT NOT NULL
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (group_id, name)
);
CREATE INDEX members_group ON members(group_id);

CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
  paid_by TEXT NOT NULL REFERENCES members(id),
  spent_on TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX expenses_group ON expenses(group_id);

CREATE TABLE expense_shares (
  expense_id TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  group_id TEXT NOT NULL,
  member_id TEXT NOT NULL REFERENCES members(id),
  share_pence INTEGER NOT NULL CHECK (share_pence >= 0),
  PRIMARY KEY (expense_id, member_id)
);
CREATE INDEX shares_group ON expense_shares(group_id);

CREATE TABLE settlements (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  from_member TEXT NOT NULL REFERENCES members(id),
  to_member TEXT NOT NULL REFERENCES members(id),
  amount_pence INTEGER NOT NULL CHECK (amount_pence > 0),
  created_at TEXT NOT NULL
);
CREATE INDEX settlements_group ON settlements(group_id);
