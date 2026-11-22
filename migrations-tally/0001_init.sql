-- Tab & Tally score keeper. Scores are an append-only list of point changes per player.

CREATE TABLE boards (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,      -- TL-XXXX-XXXX, shared so others can watch
  name TEXT NOT NULL,
  lower_wins INTEGER NOT NULL DEFAULT 0, -- 1 for golf/darts style "lowest score leads"
  admin_hash TEXT NOT NULL UNIQUE,     -- the scorekeeper's link
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  extended INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id),
  name TEXT NOT NULL COLLATE NOCASE,   -- "Di" and "di" count as the same player
  position INTEGER NOT NULL,
  UNIQUE (board_id, name)
);

CREATE TABLE scores (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  points INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX players_board ON players(board_id);
CREATE INDEX scores_board ON scores(board_id, created_at);
CREATE INDEX boards_expires ON boards(expires_at);
