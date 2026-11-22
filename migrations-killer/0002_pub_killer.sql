-- Pub killer: players take turns in order; pot any ball to stay safe, miss to lose a life.
-- Whoever pots the black covers the next re-rack. No ball numbers in this mode.
ALTER TABLE games ADD COLUMN mode TEXT NOT NULL DEFAULT 'balls';      -- balls | turns
ALTER TABLE games ADD COLUMN black_pays INTEGER NOT NULL DEFAULT 0;
ALTER TABLE players ADD COLUMN blacks INTEGER NOT NULL DEFAULT 0;     -- times they've potted the black since the last re-rack was paid
ALTER TABLE events ADD COLUMN black_player_id TEXT;
