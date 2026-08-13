import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const remoteUrl = process.env.STATE_API_URL;
const remoteToken = process.env.STATE_API_TOKEN;
const isProduction = process.env.APP_ENV === 'production' || Boolean(process.env.VERCEL);
if (isProduction && (!remoteUrl || !remoteToken)) {
  throw new Error('Produção requer STATE_API_URL e STATE_API_TOKEN para persistência de jobs.');
}
const dataDir = process.env.VERCEL ? path.join(os.tmpdir(), 'quick-filler') : path.resolve(process.cwd(), 'data');
const retentionHours = Number(process.env.TRANSCRIPTION_RETENTION_HOURS || 24);
const savedRetentionDays = Number(process.env.SAVED_EXTRACTION_RETENTION_DAYS || 90);
let db;
function purgeExpired() {
  if (remoteUrl || !db) return;
  const cutoff = new Date(Date.now() - retentionHours * 60 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM transcription_pages WHERE job_id IN (SELECT id FROM transcription_jobs WHERE created_at < ?)').run(cutoff);
  db.prepare('DELETE FROM transcription_jobs WHERE created_at < ?').run(cutoff);
}
if (!remoteUrl) {
  fs.mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(path.join(dataDir, 'quick-filler.db'));
  db.exec(`CREATE TABLE IF NOT EXISTS transcription_jobs (id TEXT PRIMARY KEY,tipo TEXT NOT NULL,status TEXT NOT NULL,progress_json TEXT NOT NULL,erro TEXT,value_json TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS transcription_pages (job_id TEXT NOT NULL,page_number INTEGER NOT NULL,value_json TEXT NOT NULL,completed_at TEXT NOT NULL,PRIMARY KEY(job_id,page_number));`);
  purgeExpired();
  for (const statement of [
    'ALTER TABLE transcription_jobs ADD COLUMN file_name TEXT',
    'ALTER TABLE transcription_jobs ADD COLUMN file_size INTEGER',
    'ALTER TABLE transcription_jobs ADD COLUMN file_key TEXT',
    'ALTER TABLE transcription_jobs ADD COLUMN expires_at TEXT',
    'ALTER TABLE transcription_jobs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE transcription_jobs ADD COLUMN last_error TEXT',
    'ALTER TABLE transcription_jobs ADD COLUMN audit_json TEXT'
  ]) { try { db.exec(statement); } catch (_) {} }
}
const hydrate = row => row && ({ id: row.id, tipo: row.tipo, status: row.status, progress: JSON.parse(row.progress_json), erro: row.erro, value: row.value_json ? JSON.parse(row.value_json) : null, fileName: row.file_name || null, fileSize: row.file_size || null, fileKey: row.file_key || null, expiresAt: row.expires_at || null, retryCount: row.retry_count || 0, lastError: row.last_error || null, audit: row.audit_json ? JSON.parse(row.audit_json) : null, createdAt: row.created_at, updatedAt: row.updated_at });
const remoteTimeoutMs = Number(process.env.STATE_API_TIMEOUT_MS || 15_000);
async function remote(action, data = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remoteTimeoutMs);
  try {
    const res = await fetch(remoteUrl, {
      method: 'POST',
      headers: { authorization: `Bearer ${remoteToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Falha ao persistir o job em produção (ação: ${action})`);
    return res.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error(`Tempo esgotado ao persistir o job em produção (ação: ${action})`);
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export class TranscriptionStore {
  constructor() { this.jobs = new Map(); }
  async createJob(tipo, file = {}) { purgeExpired(); const id = randomUUID().substring(0, 8); const now = new Date().toISOString(); const expiresAt = new Date(Date.now() + savedRetentionDays * 86400000).toISOString(); const job = { id, tipo, status: 'processando', progress: { current: 0, total: 0, percentage: 0, message: 'Iniciando leitura do documento...', logs: [] }, erro: null, value: null, fileName: file.name || 'upload.pdf', fileSize: file.size || 0, fileKey: `jobs/${id}.pdf`, expiresAt, retryCount: 0, lastError: null, audit: null, createdAt: now, updatedAt: now }; if (remoteUrl) await remote('create', { job }); else db.prepare('INSERT INTO transcription_jobs (id,tipo,status,progress_json,erro,value_json,created_at,updated_at,file_name,file_size,file_key,expires_at,retry_count,last_error,audit_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,tipo,job.status,JSON.stringify(job.progress),null,null,now,now,job.fileName,job.fileSize,job.fileKey,expiresAt,0,null,null); this.jobs.set(id, job); return job; }
  async getJob(id) {
    if (remoteUrl) {
      const { job } = await remote('get', { id });
      if (job) this.jobs.set(id, job);
      return job;
    }
    const job = hydrate(db.prepare('SELECT * FROM transcription_jobs WHERE id=?').get(id));
    if (job?.status === 'concluido' && !job.value) {
      const pages = db.prepare('SELECT value_json FROM transcription_pages WHERE job_id=? ORDER BY page_number').all(id).map(row => JSON.parse(row.value_json));
      job.value = { pages, audit: job.audit || null };
    }
    if (job) this.jobs.set(id, job);
    return job;
  }
  async persist(job) { job.updatedAt = new Date().toISOString(); if (remoteUrl) await remote('save', { job }); else db.prepare('UPDATE transcription_jobs SET status=?,progress_json=?,erro=?,value_json=?,updated_at=?,retry_count=?,last_error=?,audit_json=? WHERE id=?').run(job.status,JSON.stringify(job.progress),job.erro,job.value ? JSON.stringify(job.value) : null,job.updatedAt,job.retryCount || 0,job.lastError || null,job.audit ? JSON.stringify(job.audit) : null,job.id); this.jobs.set(job.id, job); return job; }
  async updateJobProgress(id, update) { const job = await this.getJob(id); if (!job) return null; const logs = [...(job.progress.logs || [])]; if (update.log) logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] ${update.log}`); job.progress = { current: update.current ?? job.progress.current, total: update.total ?? job.progress.total, percentage: update.percentage ?? job.progress.percentage, message: update.message || job.progress.message, logs: logs.slice(-100) }; return this.persist(job); }
  async savePageResult(id, pageNumber, value) { if (remoteUrl) { await remote('page', { id, pageNumber, value }); return value; } db.prepare(`INSERT INTO transcription_pages VALUES (?,?,?,?) ON CONFLICT(job_id,page_number) DO UPDATE SET value_json=excluded.value_json,completed_at=excluded.completed_at`).run(id,pageNumber,JSON.stringify(value),new Date().toISOString()); return value; }
  async getCompletedPageNumbers(id) { if (remoteUrl) { const { pages } = await remote('completed_pages', { id }); return pages || []; } return db.prepare('SELECT page_number FROM transcription_pages WHERE job_id=?').all(id).map(row => row.page_number); }
  async saveDocument(job, buffer) { if (remoteUrl) return remote('file_put', { id: job.id, fileKey: job.fileKey, content: buffer.toString('base64'), contentType: 'application/pdf', expiresAt: job.expiresAt }); const fileDir = path.join(dataDir, 'documents'); fs.mkdirSync(fileDir, { recursive: true }); fs.writeFileSync(path.join(fileDir, `${job.id}.pdf`), buffer); }
  async getDocument(job) { if (remoteUrl) { const { content } = await remote('file_get', { fileKey: job.fileKey }); return Buffer.from(content, 'base64'); } return fs.readFileSync(path.join(dataDir, 'documents', `${job.id}.pdf`)); }
  async listJobs() { if (remoteUrl) { const { jobs } = await remote('list'); return jobs || []; } return db.prepare('SELECT * FROM transcription_jobs ORDER BY updated_at DESC').all().map(hydrate); }
  async deleteJob(id) { const job = await this.getJob(id); if (!job) return null; if (remoteUrl) await remote('delete', { id, fileKey: job.fileKey }); else { try { fs.unlinkSync(path.join(dataDir, 'documents', `${id}.pdf`)); } catch (_) {} db.prepare('DELETE FROM transcription_pages WHERE job_id=?').run(id); db.prepare('DELETE FROM transcription_jobs WHERE id=?').run(id); } this.jobs.delete(id); return job; }
  async startRetry(id, message = 'Retomando auditoria pelas páginas pendentes...') { const job = await this.getJob(id); if (!job || job.status === 'processando') return job; job.status = 'processando'; job.erro = null; job.lastError = null; job.progress = { ...job.progress, message }; job.retryCount = (job.retryCount || 0) + 1; return this.persist(job); }
  async completeJob(id, value) {
    const job = await this.getJob(id);
    if (!job) return null;
    job.status = 'concluido';
    job.erro = null;
    job.value = null;
    job.audit = value?.audit || null;
    job.progress = { ...job.progress, percentage: 100, message: 'Transcrição e processamento concluídos!' };
    // Cada página já foi persistida durante a extração. Não reenvie o documento
    // inteiro no fechamento: em documentos grandes isso duplicava o payload e
    // podia deixar a chamada final pendente em produção.
    if (remoteUrl) {
      await remote('complete', { id: job.id, progress: job.progress, audit: job.audit });
      this.jobs.set(job.id, job);
      return job;
    }
    job.updatedAt = new Date().toISOString();
    db.prepare('UPDATE transcription_jobs SET status=?,progress_json=?,erro=?,value_json=?,updated_at=?,audit_json=? WHERE id=?').run(job.status, JSON.stringify(job.progress), null, null, job.updatedAt, job.audit ? JSON.stringify(job.audit) : null, job.id);
    this.jobs.set(job.id, job);
    return job;
  }
  async failJob(id, error) { const job = await this.getJob(id); if (!job) return null; job.status='erro'; job.erro=error || 'Erro interno no processamento do documento'; job.lastError=job.erro; job.value=null; job.progress={...job.progress,message:'Ocorreu um erro durante o processamento.'}; return this.persist(job); }
  async updateJobValue(id, value) { const job = await this.getJob(id); if (!job) return null; job.value=value; return this.persist(job); }
  async clear() { this.jobs.clear(); if (!remoteUrl) db.exec('DELETE FROM transcription_pages; DELETE FROM transcription_jobs;'); }
}
export const transcriptionStore = new TranscriptionStore();
