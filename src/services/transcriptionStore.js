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
let db;
if (!remoteUrl) {
  fs.mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(path.join(dataDir, 'quick-filler.db'));
  db.exec(`CREATE TABLE IF NOT EXISTS transcription_jobs (id TEXT PRIMARY KEY,tipo TEXT NOT NULL,status TEXT NOT NULL,progress_json TEXT NOT NULL,erro TEXT,value_json TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS transcription_pages (job_id TEXT NOT NULL,page_number INTEGER NOT NULL,value_json TEXT NOT NULL,completed_at TEXT NOT NULL,PRIMARY KEY(job_id,page_number));`);
}
const hydrate = row => row && ({ id: row.id, tipo: row.tipo, status: row.status, progress: JSON.parse(row.progress_json), erro: row.erro, value: row.value_json ? JSON.parse(row.value_json) : null, createdAt: row.created_at, updatedAt: row.updated_at });
async function remote(action, data = {}) { const res = await fetch(remoteUrl, { method: 'POST', headers: { authorization: `Bearer ${remoteToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ action, ...data }) }); if (!res.ok) throw new Error('Falha ao persistir o job em produção'); return res.json(); }

export class TranscriptionStore {
  constructor() { this.jobs = new Map(); }
  async createJob(tipo) { const id = randomUUID().substring(0, 8); const now = new Date().toISOString(); const job = { id, tipo, status: 'processando', progress: { current: 0, total: 0, percentage: 0, message: 'Iniciando leitura do documento...', logs: [] }, erro: null, value: null, createdAt: now, updatedAt: now }; if (remoteUrl) await remote('create', { job }); else db.prepare('INSERT INTO transcription_jobs VALUES (?,?,?,?,?,?,?,?)').run(id,tipo,job.status,JSON.stringify(job.progress),null,null,now,now); this.jobs.set(id, job); return job; }
  async getJob(id) { if (remoteUrl) { const { job } = await remote('get', { id }); if (job) this.jobs.set(id, job); return job; } const job = hydrate(db.prepare('SELECT * FROM transcription_jobs WHERE id=?').get(id)); if (job) this.jobs.set(id, job); return job; }
  async persist(job) { job.updatedAt = new Date().toISOString(); if (remoteUrl) await remote('save', { job }); else db.prepare('UPDATE transcription_jobs SET status=?,progress_json=?,erro=?,value_json=?,updated_at=? WHERE id=?').run(job.status,JSON.stringify(job.progress),job.erro,job.value ? JSON.stringify(job.value) : null,job.updatedAt,job.id); this.jobs.set(job.id, job); return job; }
  async updateJobProgress(id, update) { const job = await this.getJob(id); if (!job) return null; const logs = [...(job.progress.logs || [])]; if (update.log) logs.push(`[${new Date().toLocaleTimeString('pt-BR')}] ${update.log}`); job.progress = { current: update.current ?? job.progress.current, total: update.total ?? job.progress.total, percentage: update.percentage ?? job.progress.percentage, message: update.message || job.progress.message, logs }; return this.persist(job); }
  async savePageResult(id, pageNumber, value) { if (remoteUrl) { await remote('page', { id, pageNumber, value }); return value; } db.prepare(`INSERT INTO transcription_pages VALUES (?,?,?,?) ON CONFLICT(job_id,page_number) DO UPDATE SET value_json=excluded.value_json,completed_at=excluded.completed_at`).run(id,pageNumber,JSON.stringify(value),new Date().toISOString()); return value; }
  async completeJob(id, value) { const job = await this.getJob(id); if (!job) return null; job.status='concluido'; job.erro=null; job.value=value; job.progress={...job.progress,percentage:100,message:'Transcrição e processamento concluídos!'}; return this.persist(job); }
  async failJob(id, error) { const job = await this.getJob(id); if (!job) return null; job.status='erro'; job.erro=error || 'Erro interno no processamento do documento'; job.value=null; job.progress={...job.progress,message:'Ocorreu um erro durante o processamento.'}; return this.persist(job); }
  async updateJobValue(id, value) { const job = await this.getJob(id); if (!job) return null; job.value=value; return this.persist(job); }
  async clear() { this.jobs.clear(); if (!remoteUrl) db.exec('DELETE FROM transcription_pages; DELETE FROM transcription_jobs;'); }
}
export const transcriptionStore = new TranscriptionStore();
