-- Pub killer "final shot": the last player standing must pot a ball to win.
-- If they miss, everyone comes back in with full lives. The snapshot lets that be undone.
ALTER TABLE games ADD COLUMN final_shot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE events ADD COLUMN snapshot TEXT;   -- JSON {playerId: livesBefore} for a roll-over
