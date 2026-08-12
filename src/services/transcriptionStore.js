import { randomUUID } from 'node:crypto';

/**
 * Gerenciador de armazenamento em memória para o ciclo de vida das transcrições.
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
    return job;
  }

  /**
   * Atualiza o progresso em tempo real de um job.
   * @param {string} id 
   * @param {{ current?: number, total?: number, percentage?: number, message?: string, log?: string }} progressUpdate 
   */
  updateJobProgress(id, { current, total, percentage, message, log }) {
    const job = this.jobs.get(id);
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
    return job;
  }

  /**
   * Busca um job pelo ID.
   * @param {string} id 
   * @returns {Object|null}
   */
  getJob(id) {
    return this.jobs.get(id) || null;
  }

  /**
   * Completa um trabalho com sucesso atualizando o campo 'value'.
   * @param {string} id 
   * @param {Object} value 
   */
  completeJob(id, value) {
    const job = this.jobs.get(id);
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
    return job;
  }

  /**
   * Marca um trabalho com erro de processamento.
   * @param {string} id 
   * @param {string} errorMessage 
   */
  failJob(id, errorMessage) {
    const job = this.jobs.get(id);
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
    return job;
  }

  /**
   * Atualiza o campo 'value' de um job concluído (edições da UI).
   * @param {string} id 
   * @param {Object} newValue 
   */
  updateJobValue(id, newValue) {
    const job = this.jobs.get(id);
    if (!job) return null;

    job.value = newValue;
    job.updatedAt = new Date().toISOString();
    return job;
  }

  /**
   * Limpa todos os jobs (útil para suíte de testes).
   */
  clear() {
    this.jobs.clear();
  }
}

export const transcriptionStore = new TranscriptionStore();
