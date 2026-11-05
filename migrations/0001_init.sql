CREATE TABLE IF NOT EXISTS competitions (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emblem TEXT,
  area TEXT
);

CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY,
  competition TEXT NOT NULL,
  matchday INTEGER,
  stage TEXT,
  kickoff INTEGER NOT NULL,
  status TEXT NOT NULL,
  home_id INTEGER NOT NULL,
  home_name TEXT NOT NULL,
  home_tla TEXT,
  home_crest TEXT,
  away_id INTEGER NOT NULL,
  away_name TEXT NOT NULL,
  away_tla TEXT,
  away_crest TEXT,
  duration TEXT,
  home_goals INTEGER,
  away_goals INTEGER,
  settled_key TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_kickoff ON matches(kickoff);
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);

CREATE TABLE IF NOT EXISTS sync_state (
  key TEXT PRIMARY KEY,
  last_run INTEGER NOT NULL DEFAULT 0,
  value TEXT
);

CREATE TABLE IF NOT EXISTS api_calls (
  ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_calls_ts ON api_calls(ts);

CREATE TABLE IF NOT EXISTS groups (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_code TEXT NOT NULL,
  name TEXT NOT NULL,
  salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '{}',
  frame TEXT NOT NULL DEFAULT 'none',
  title TEXT NOT NULL DEFAULT 'rookie',
  coins_spent INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (group_code, name)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  player_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tips (
  player_id INTEGER NOT NULL,
  match_id INTEGER NOT NULL,
  market TEXT NOT NULL,
  pick TEXT NOT NULL,
  potential INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  points INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, match_id, market)
);
CREATE INDEX IF NOT EXISTS idx_tips_match ON tips(match_id);

CREATE TABLE IF NOT EXISTS inventory (
  player_id INTEGER NOT NULL,
  item_id TEXT NOT NULL,
  acquired_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, item_id)
);
