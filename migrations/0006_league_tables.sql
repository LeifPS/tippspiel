-- Ligatabellen zum Nachschauen (Gesamttabelle pro Wettbewerb, bei Gruppenphasen pro Gruppe)
CREATE TABLE IF NOT EXISTS league_tables (
  comp TEXT NOT NULL,
  grp TEXT NOT NULL DEFAULT '',
  team_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  tla TEXT,
  crest TEXT,
  played INTEGER NOT NULL,
  won INTEGER NOT NULL,
  draw INTEGER NOT NULL,
  lost INTEGER NOT NULL,
  goals_for INTEGER NOT NULL,
  goals_against INTEGER NOT NULL,
  points INTEGER NOT NULL,
  PRIMARY KEY (comp, grp, team_id)
);
