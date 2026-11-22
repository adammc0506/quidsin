-- Tab & Tally Secret Santa. Nobody, organiser included, can read the full draw through the app.
-- Private links (one per person, one for the organiser) are stored only as SHA-256 hashes.

CREATE TABLE draws (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,      -- SS-XXXX-XXXX, shared with the group
  name TEXT NOT NULL,
  budget_pence INTEGER,                -- optional spend limit
  exchange_date TEXT,                  -- optional YYYY-MM-DD
  admin_hash TEXT NOT NULL UNIQUE,     -- organiser link
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  extended INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  draw_id TEXT NOT NULL REFERENCES draws(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL,
  gives_to TEXT NOT NULL,              -- participant id they buy for
  claim_hash TEXT UNIQUE,              -- set when someone taps this name
  claimed_at TEXT,
  wishlist TEXT NOT NULL DEFAULT '',
  UNIQUE (draw_id, name)
);

CREATE INDEX participants_draw ON participants(draw_id);
CREATE INDEX draws_expires ON draws(expires_at);
