import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const JOBS_DIR = path.join(os.tmpdir(), 'quick_filler_jobs');

function ensureJobsDir() {
  if (!fs.existsSync(JOBS_DIR)) {
    try {
      fs.mkdirSync(JOBS_DIR, { recursive: true });
    } catch (_) {}
  }
}

function saveJobToDisk(job) {
  if (!job || !job.id) return;
  try {
    ensureJobsDir();
    const filePath = path.join(JOBS_DIR, `${job.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(job), 'utf8');
  } catch (err) {
    console.error(`⚠️ Erro ao salvar job ${job.id} no disco:`, err.message);
  }
}

function readJobFromDisk(id) {
  if (!id) return null;
  try {
    const filePath = path.join(JOBS_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`⚠️ Erro ao ler job ${id} do disco:`, err.message);
  }
  return null;
}

function removeJobFromDisk(id) {
  if (!id) return;
  try {
    const filePath = path.join(JOBS_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (_) {}
}

/**
 * Gerenciador de armazenamento em memória e disco para o ciclo de vida das transcrições.
 * Suporta estados: 'processando', 'concluido', 'erro'.
 */
export class TranscriptionStore {
  constructor() {
    /** @type {Map<string, { id: string, tipo: string, status: 'processando'|'concluido'|'erro', erro: string|null, value: Object|null, createdAt: string, updatedAt: string }>} */
    this.jobs = new Map();
  }

  /**
   * Cria um novo trabalho de transcrição no estado 'processando'.
   * @param {'cartao-ponto' | 'holerite'} tipo 
   * @returns {{ id: string, tipo: string, status: string, erro: null, value: null }}
   */
  createJob(tipo) {
    const id = randomUUID().substring(0, 8);
    const now = new Date().toISOString();

    const job = {
      id,
      tipo,
      status: 'processando',
      progress: {
        current: 0,
        total: 0,
        percentage: 0,
        message: 'Iniciando leitura do documento...',
        logs: [`[${new Date().toLocaleTimeString('pt-BR')}] 🚀 Trabalho de transcrição iniciado (ID: ${id})`]
      },
      erro: null,
      value: null,
      createdAt: now,
      updatedAt: now
    };

    this.jobs.set(id, job);
    saveJobToDisk(job);
    return job;
  }

  /**
   * Atualiza o progresso em tempo real de um job.
   * @param {string} id 
   * @param {{ current?: number, total?: number, percentage?: number, message?: string, log?: string }} progressUpdate 
   */
  updateJobProgress(id, { current, total, percentage, message, log }) {
    const job = this.getJob(id);
    if (!job) return null;

    const updatedLogs = [...(job.progress?.logs || [])];
    if (log && typeof log === 'string') {
      const timeStr = new Date().toLocaleTimeString('pt-BR');
      updatedLogs.push(`[${timeStr}] ${log}`);
    }

    const currentProg = job.progress || {};
    job.progress = {
      current: current !== undefined ? current : currentProg.current || 0,
      total: total !== undefined ? total : currentProg.total || 0,
      percentage: percentage !== undefined ? percentage : currentProg.percentage || 0,
      message: message || currentProg.message || 'Processando...',
      logs: updatedLogs
    };

    job.updatedAt = new Date().toISOString();
    this.jobs.set(id, job);
    saveJobToDisk(job);
    return job;
  }

  /**
   * Busca um job pelo ID (em memória ou no disco temporário).
   * @param {string} id 
   * @returns {Object|null}
   */
  getJob(id) {
    let job = this.jobs.get(id);
    if (!job) {
      job = readJobFromDisk(id);
      if (job) {
        this.jobs.set(id, job);
      }
    }
    return job || null;
  }

  /**
   * Completa um trabalho com sucesso atualizando o campo 'value'.
   * @param {string} id 
   * @param {Object} value 
   */
  completeJob(id, value) {
    const job = this.getJob(id);
    if (!job) return null;

    const timeStr = new Date().toLocaleTimeString('pt-BR');
    const updatedLogs = [...(job.progress?.logs || []), `[${timeStr}] 🎉 Processamento finalizado com sucesso!`];

    job.status = 'concluido';
    job.erro = null;
    job.value = value;
    job.progress = {
      ...job.progress,
      percentage: 100,
      message: 'Transcrição e processamento concluídos!',
      logs: updatedLogs
    };
    job.updatedAt = new Date().toISOString();
    this.jobs.set(id, job);
    saveJobToDisk(job);
    return job;
  }

  /**
   * Marca um trabalho com erro de processamento.
   * @param {string} id 
   * @param {string} errorMessage 
   */
  failJob(id, errorMessage) {
    const job = this.getJob(id);
    if (!job) return null;

    const timeStr = new Date().toLocaleTimeString('pt-BR');
    const updatedLogs = [...(job.progress?.logs || []), `[${timeStr}] ❌ Erro: ${errorMessage || 'Falha no processamento'}`];

    job.status = 'erro';
    job.erro = errorMessage || 'Erro interno no processamento do documento';
    job.value = null;
    job.progress = {
      ...job.progress,
      message: 'Ocorreu um erro durante o processamento.',
      logs: updatedLogs
    };
    job.updatedAt = new Date().toISOString();
    this.jobs.set(id, job);
    saveJobToDisk(job);
    return job;
  }

  /**
   * Atualiza o campo 'value' de um job concluído (edições da UI).
   * @param {string} id 
   * @param {Object} newValue 
   */
  updateJobValue(id, newValue) {
    const job = this.getJob(id);
    if (!job) return null;

    job.value = newValue;
    job.updatedAt = new Date().toISOString();
    this.jobs.set(id, job);
    saveJobToDisk(job);
    return job;
  }

  /**
   * Limpa todos os jobs (útil para suíte de testes).
   */
  clear() {
    this.jobs.clear();
    try {
      if (fs.existsSync(JOBS_DIR)) {
        const files = fs.readdirSync(JOBS_DIR);
        for (const file of files) {
          if (file.endsWith('.json')) {
            fs.unlinkSync(path.join(JOBS_DIR, file));
          }
        }
      }
    } catch (_) {}
  }
}

export const transcriptionStore = new TranscriptionStore();

