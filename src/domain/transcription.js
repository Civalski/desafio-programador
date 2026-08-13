export const TRANSCRIPTION_STATUS = Object.freeze({ PROCESSING: 'processando', COMPLETED: 'concluido', FAILED: 'erro' });

export function isSupportedDocumentType(type) {
  return type === 'holerite';
}

export function isCompleted(job) {
  return job?.status === TRANSCRIPTION_STATUS.COMPLETED && Boolean(job.value);
}
