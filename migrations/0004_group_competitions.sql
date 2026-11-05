-- Gründer der Gruppe und die Wettbewerbe, die in der Gruppe getippt werden (NULL = alle)
ALTER TABLE groups ADD COLUMN founder_id INTEGER;
ALTER TABLE groups ADD COLUMN competitions TEXT;
UPDATE groups SET founder_id = (SELECT MIN(id) FROM players WHERE players.group_code = groups.code);
