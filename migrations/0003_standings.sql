-- Tabellenstand pro Wettbewerb: Grundlage für die Punkte (Favorit bringt weniger, Außenseiter mehr)
CREATE TABLE IF NOT EXISTS standings (
  comp TEXT NOT NULL,
  team_id INTEGER NOT NULL,
  played INTEGER NOT NULL,
  goals_for INTEGER NOT NULL,
  goals_against INTEGER NOT NULL,
  points INTEGER NOT NULL,
  PRIMARY KEY (comp, team_id)
);
