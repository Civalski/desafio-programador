CREATE TABLE IF NOT EXISTS transcription_results (
  job_id TEXT NOT NULL,
  result_key TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  result_kind TEXT NOT NULL CHECK (result_kind IN ('checkpoint', 'final')),
  attempts INTEGER NOT NULL DEFAULT 1,
  value_json TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (job_id, result_key),
  FOREIGN KEY (job_id) REFERENCES transcription_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_transcription_results_job_kind
  ON transcription_results(job_id, result_kind, page_number, result_key);
