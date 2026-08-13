import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Vercel permite escrita apenas em /tmp; localmente mantemos o banco no projeto.
const dataDir = process.env.VERCEL ? path.join(os.tmpdir(), 'quick-filler') : path.resolve(process.cwd(), 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new DatabaseSync(path.join(dataDir, 'quick-filler.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS transcription_jobs (
    id TEXT PRIMARY KEY, tipo TEXT NOT NULL, status TEXT NOT NULL,
    progress_json TEXT NOT NULL, erro TEXT, value_json TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS transcription_pages (
    job_id TEXT NOT NULL, page_number INTEGER NOT NULL, value_json TEXT NOT NULL,
    completed_at TEXT NOT NULL, PRIMARY KEY (job_id, page_number)
  );
`);
const getStatement = db.prepare('SELECT * FROM transcription_jobs WHERE id = ?');
const pageStatement = db.prepare('SELECT page_number, value_json FROM transcription_pages WHERE job_id = ? ORDER BY page_number');

function hydrate(row) {
  if (!row) return null;
  return { id: row.id, tipo: row.tipo, status: row.status, progress: JSON.parse(row.progress_json), erro: row.erro, value: row.value_json ? JSON.parse(row.value_json) : null, createdAt: row.created_at, updatedAt: row.updated_at };
}

export class TranscriptionStore {
  constructor() { this.jobs = new Map(); }

  createJob(tipo) {
    const id = randomUUID().substring(0, 8);
    const now = new Date().toISOString();
    const job = { id, tipo, status: 'processando', progress: { current: 0, total: 0, percentage: 0, message: 'Iniciando leitura do documento...', logs: [`[${new Date().toLocaleTimeString('pt-BR')}] Trabalho de transcrição iniciado (ID: ${id})`] }, erro: null, value: null, createdAt: now, updatedAt: now };
    db.prepare('INSERT INTO transcription_jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, tipo, job.status, JSON.stringify(job.progress), null, null, now, now);
    this.jobs.set(id, job);
    return job;
  }

  getJob(id) {
    const job = hydrate(getStatement.get(id));
    if (job) this.jobs.set(id, job);
    return job;
  }

  persist(job) {
    db.prepare('UPDATE transcription_jobs SET status=?, progress_json=?, erro=?, value_json=?, updated_at=? WHERE id=?').run(job.status, JSON.stringify(job.progress), job.erro, job.value ? JSON.stringify(job.value) : null, job.updatedAt, job.id);
    this.jobs.set(job.id, job);
    return job;
  }

  updateJobProgress(id, update) {
    const job = this.getJob(id);
    if (!job) return null;
    const logs = [...(job.progress.logs || [])];
    if (update.log) logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] ${update.log}`);
    job.progress = { current: update.current ?? job.progress.current ?? 0, total: update.total ?? job.progress.total ?? 0, percentage: update.percentage ?? job.progress.percentage ?? 0, message: update.message || job.progress.message || 'Processando...', logs };
    job.updatedAt = new Date().toISOString();
    return this.persist(job);
  }

  savePageResult(id, pageNumber, value) {
    if (!this.getJob(id)) return null;
    db.prepare(`INSERT INTO transcription_pages VALUES (?, ?, ?, ?) ON CONFLICT(job_id, page_number) DO UPDATE SET value_json=excluded.value_json, completed_at=excluded.completed_at`).run(id, pageNumber, JSON.stringify(value), new Date().toISOString());
    return value;
  }

  getPageResults(id) { return pageStatement.all(id).map(row => ({ page: row.page_number, value: JSON.parse(row.value_json) })); }

  completeJob(id, value) {
    const job = this.getJob(id);
    if (!job) return null;
    job.status = 'concluido'; job.erro = null; job.value = value;
    job.progress = { ...job.progress, percentage: 100, message: 'Transcrição e processamento concluídos!', logs: [...(job.progress.logs || []), `[${new Date().toLocaleTimeString('pt-BR')}] Processamento finalizado com sucesso!`] };
    job.updatedAt = new Date().toISOString();
    return this.persist(job);
  }

  failJob(id, errorMessage) {
    const job = this.getJob(id);
    if (!job) return null;
    job.status = 'erro'; job.erro = errorMessage || 'Erro interno no processamento do documento'; job.value = null;
    job.progress = { ...job.progress, message: 'Ocorreu um erro durante o processamento.', logs: [...(job.progress.logs || []), `[${new Date().toLocaleTimeString('pt-BR')}] Erro: ${job.erro}`] };
    job.updatedAt = new Date().toISOString();
    return this.persist(job);
  }

  updateJobValue(id, value) { const job = this.getJob(id); if (!job) return null; job.value = value; job.updatedAt = new Date().toISOString(); return this.persist(job); }
  clear() { this.jobs.clear(); db.exec('DELETE FROM transcription_pages; DELETE FROM transcription_jobs;'); }
}
export const transcriptionStore = new TranscriptionStore();