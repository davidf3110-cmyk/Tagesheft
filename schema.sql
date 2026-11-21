CREATE TABLE IF NOT EXISTS docs (
  c   TEXT NOT NULL,          -- Sammlung (days, todos, prayers, …)
  id  TEXT NOT NULL,          -- Dokument-ID
  d   TEXT,                   -- JSON-Inhalt, NULL wenn gelöscht
  u   INTEGER NOT NULL,       -- letzte Änderung (ms seit 1970)
  PRIMARY KEY (c, id)
);
CREATE INDEX IF NOT EXISTS docs_u ON docs (u);
