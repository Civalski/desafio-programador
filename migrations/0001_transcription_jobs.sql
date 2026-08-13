CREATE TABLE IF NOT EXISTS transcription_jobs (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendente', 'processando', 'concluido', 'erro')),
  total_pages INTEGER NOT NULL DEFAULT 0,
  completed_pages INTEGER NOT NULL DEFAULT 0,
  progress_json TEXT NOT NULL,
  value_json TEXT,
  erro TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transcription_pages (
  job_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pendente', 'processando', 'concluida', 'erro')),
  attempts INTEGER NOT NULL DEFAULT 0,
  value_json TEXT,
  erro TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (job_id, page_number),
  FOREIGN KEY (job_id) REFERENCES transcription_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transcription_pages_recovery
  ON transcription_pages(status, updated_at);
