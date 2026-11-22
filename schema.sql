CREATE TABLE IF NOT EXISTS docs (
  c   TEXT NOT NULL,          -- Sammlung (days, todos, prayers, …)
  id  TEXT NOT NULL,          -- Dokument-ID
  d   TEXT,                   -- JSON-Inhalt, NULL wenn gelöscht
  u   INTEGER NOT NULL,       -- letzte Änderung (ms seit 1970)
  PRIMARY KEY (c, id)
);
CREATE INDEX IF NOT EXISTS docs_u ON docs (u);
-- Geheimnisse (z. B. Anthropic-API-Schlüssel). Wird nie über /api/sync ausgeliefert.
CREATE TABLE IF NOT EXISTS secrets (k TEXT PRIMARY KEY, v TEXT NOT NULL);
