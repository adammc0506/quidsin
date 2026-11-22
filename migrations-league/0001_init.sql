-- Tab & Tally League. Teams or players, fixtures and results; the table is worked out from the results.

CREATE TABLE leagues (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,      -- LG-XXXX-XXXX
  name TEXT NOT NULL,
  win_points INTEGER NOT NULL DEFAULT 3,
  draw_points INTEGER NOT NULL DEFAULT 1,
  admin_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  extended INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  name TEXT NOT NULL COLLATE NOCASE,
  position INTEGER NOT NULL,
  UNIQUE (league_id, name)
);

-- A match with no scores yet is a fixture.
CREATE TABLE matches (
  id TEXT PRIMARY KEY,
  league_id TEXT NOT NULL REFERENCES leagues(id),
  home_id TEXT NOT NULL REFERENCES teams(id),
  away_id TEXT NOT NULL REFERENCES teams(id),
  home_score INTEGER,
  away_score INTEGER,
  position INTEGER NOT NULL,           -- order fixtures were created in
  played_at TEXT
);

CREATE INDEX teams_league ON teams(league_id);
CREATE INDEX matches_league ON matches(league_id, position);
CREATE INDEX leagues_expires ON leagues(expires_at);
