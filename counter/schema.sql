-- The whole database. One table, two columns, numbers only.
CREATE TABLE IF NOT EXISTS counts (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
