-- Tab & Tally Whip-round. Tracks who has chipped in. It never holds or moves money,
-- and never stores bank details (the "how to pay" note is checked for account numbers).

CREATE TABLE pots (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,      -- WR-XXXX-XXXX
  name TEXT NOT NULL,
  about TEXT NOT NULL DEFAULT '',
  suggested_pence INTEGER,             -- optional suggested amount per person
  target_pence INTEGER,                -- optional target total
  closes_on TEXT,                      -- optional YYYY-MM-DD
  how_to_pay TEXT NOT NULL DEFAULT '', -- free text, no account numbers
  show_amounts INTEGER NOT NULL DEFAULT 0,
  closed INTEGER NOT NULL DEFAULT 0,
  admin_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  extended INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE entries (
  id TEXT PRIMARY KEY,
  pot_id TEXT NOT NULL REFERENCES pots(id),
  name TEXT NOT NULL,
  amount_pence INTEGER NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0, -- organiser has received it
  created_at TEXT NOT NULL
);

CREATE INDEX entries_pot ON entries(pot_id);
CREATE INDEX pots_expires ON pots(expires_at);
