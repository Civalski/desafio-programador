ALTER TABLE transcription_jobs ADD COLUMN file_name TEXT;
ALTER TABLE transcription_jobs ADD COLUMN file_size INTEGER;
ALTER TABLE transcription_jobs ADD COLUMN file_key TEXT;
ALTER TABLE transcription_jobs ADD COLUMN expires_at TEXT;
ALTER TABLE transcription_jobs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE transcription_jobs ADD COLUMN last_error TEXT;
ALTER TABLE transcription_jobs ADD COLUMN audit_json TEXT;
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_updated_at ON transcription_jobs(updated_at DESC);
