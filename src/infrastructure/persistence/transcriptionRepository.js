import { transcriptionStore } from '../../services/transcriptionStore.js';

/**
 * Adapter for the existing local SQLite/filesystem and remote State Worker implementations.
 * The store keeps its environment-specific SQL/HTTP details behind this port.
 */
export class TranscriptionRepository {
  constructor(store = transcriptionStore) { this.store = store; }
  createJob(...args) { return this.store.createJob(...args); }
  getJob(...args) { return this.store.getJob(...args); }
  listJobs(...args) { return this.store.listJobs(...args); }
  deleteJob(...args) { return this.store.deleteJob(...args); }
  updateJobProgress(...args) { return this.store.updateJobProgress(...args); }
  saveResult(...args) { return this.store.saveResult(...args); }
  getCompletedResultKeys(...args) { return this.store.getCompletedResultKeys(...args); }
  getCheckpointResults(...args) { return this.store.getCheckpointResults(...args); }
  completeJob(...args) { return this.store.completeJob(...args); }
  failJob(...args) { return this.store.failJob(...args); }
  startRetry(...args) { return this.store.startRetry(...args); }
  updateJobValue(...args) { return this.store.updateJobValue(...args); }
}

export class DocumentStorage {
  constructor(store = transcriptionStore) { this.store = store; }
  saveDocument(...args) { return this.store.saveDocument(...args); }
  getDocument(...args) { return this.store.getDocument(...args); }
}
