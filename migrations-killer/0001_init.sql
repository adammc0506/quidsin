-- Tab & Tally Killer Pool. A referee records pots; lives and "killer" status are kept per player.

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,        -- KP-XXXX-XXXX, shared so others can watch
  name TEXT NOT NULL,
  start_lives INTEGER NOT NULL,
  killer_required INTEGER NOT NULL,      -- must pot your own ball before you can take lives
  own_loses INTEGER NOT NULL,            -- a killer potting their own ball loses a life
  scratch_loses INTEGER NOT NULL,        -- potting the cue ball loses a life
  secret_balls INTEGER NOT NULL,         -- hide ball numbers from watchers until a player is out
  admin_hash TEXT NOT NULL UNIQUE,       -- the referee's link
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  extended INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  name TEXT NOT NULL COLLATE NOCASE,
  position INTEGER NOT NULL,
  ball INTEGER NOT NULL,                 -- 1 to 15
  lives INTEGER NOT NULL,
  killer INTEGER NOT NULL DEFAULT 0,
  UNIQUE (game_id, name),
  UNIQUE (game_id, ball)
);

-- One row per change, so the last one can be undone.
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  game_id TEXT NOT NULL REFERENCES games(id),
  kind TEXT NOT NULL,                    -- own | pot | scratch | adjust
  shooter_id TEXT,
  victim_id TEXT,
  lives_player_id TEXT,                  -- whose lives changed
  lives_delta INTEGER,
  killer_player_id TEXT,                 -- who became a killer
  created_at TEXT NOT NULL
);

CREATE INDEX players_game ON players(game_id);
CREATE INDEX events_game ON events(game_id, created_at);
CREATE INDEX games_expires ON games(expires_at);
