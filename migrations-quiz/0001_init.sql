-- Tab & Tally Quiz Night. Teams, rounds, and a score for each team in each round.

CREATE TABLE quizzes (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,      -- QZ-XXXX-XXXX
  name TEXT NOT NULL,
  admin_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  extended INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id),
  name TEXT NOT NULL COLLATE NOCASE,
  position INTEGER NOT NULL,
  UNIQUE (quiz_id, name)
);

CREATE TABLE rounds (
  id TEXT PRIMARY KEY,
  quiz_id TEXT NOT NULL REFERENCES quizzes(id),
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);

CREATE TABLE scores (
  round_id TEXT NOT NULL REFERENCES rounds(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  quiz_id TEXT NOT NULL REFERENCES quizzes(id),
  points REAL NOT NULL,                -- half points allowed
  PRIMARY KEY (round_id, team_id)
);

CREATE INDEX teams_quiz ON teams(quiz_id);
CREATE INDEX rounds_quiz ON rounds(quiz_id);
CREATE INDEX scores_quiz ON scores(quiz_id);
CREATE INDEX quizzes_expires ON quizzes(expires_at);
