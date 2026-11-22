-- Tab & Tally Sweepstake. Items (teams, horses, numbers) are dealt to people at random once, when it's created.
-- It only records who has what. No money is handled.

CREATE TABLE sweeps (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,      -- SW-XXXX-XXXX
  name TEXT NOT NULL,
  about TEXT NOT NULL DEFAULT '',
  admin_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  extended INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE entrants (
  id TEXT PRIMARY KEY,
  sweep_id TEXT NOT NULL REFERENCES sweeps(id),
  name TEXT NOT NULL COLLATE NOCASE,
  position INTEGER NOT NULL,
  UNIQUE (sweep_id, name)
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  sweep_id TEXT NOT NULL REFERENCES sweeps(id),
  label TEXT NOT NULL,
  position INTEGER NOT NULL,
  entrant_id TEXT REFERENCES entrants(id),  -- null if there were more items than people... or the reverse
  status TEXT NOT NULL DEFAULT 'in'         -- in | out | won
);

CREATE INDEX entrants_sweep ON entrants(sweep_id);
CREATE INDEX items_sweep ON items(sweep_id);
CREATE INDEX sweeps_expires ON sweeps(expires_at);
