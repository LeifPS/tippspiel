-- Wann ein Tipp gewertet wurde (für die Platzänderung der letzten 24 Stunden in der Rangliste)
ALTER TABLE tips ADD COLUMN settled_at INTEGER;
