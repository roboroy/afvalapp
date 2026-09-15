-- De hele database. Eén tabel, twee kolommen, alleen getallen.
CREATE TABLE IF NOT EXISTS tellingen (
  sleutel TEXT PRIMARY KEY,
  aantal  INTEGER NOT NULL DEFAULT 0
);
