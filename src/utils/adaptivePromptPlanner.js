const MONEY = /-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+(?:[.,]\d+)?%/g;

export const DEFAULT_MAX_PROMPT_TARGETS = 6;
export const DEFAULT_MAX_PROMPT_CHARS = 6000;

function textOf(target) {
  return String(target?.evidence || target?.line || target?.text || '');
}

function recursivelySplit(targets, options, output) {
  if (!targets.length) return;
  if (targets.length > options.maxTargets) {
    for (let index = 0; index < targets.length; index += options.maxTargets) {
      recursivelySplit(targets.slice(index, index + options.maxTargets), options, output);
    }
    return;
  }
  const textLength = targets.reduce((sum, target) => sum + textOf(target).length + 1, 0);
  if (targets.length <= options.maxTargets && textLength <= options.maxChars) {
    output.push(targets);
    return;
  }
  if (targets.length === 1) {
    const target = targets[0];
    const evidence = textOf(target);
    if (evidence.length > options.maxChars) {
      output.push([{ ...target, oversizedEvidence: true }]);
    } else output.push(targets);
    return;
  }
  const midpoint = Math.ceil(targets.length / 2);
  recursivelySplit(targets.slice(0, midpoint), options, output);
  recursivelySplit(targets.slice(midpoint), options, output);
}

export function createAdaptiveBatches(targets = [], options = {}) {
  const settings = {
    maxTargets: Math.max(1, Number(options.maxTargets || DEFAULT_MAX_PROMPT_TARGETS)),
    maxChars: Math.max(500, Number(options.maxChars || DEFAULT_MAX_PROMPT_CHARS))
  };
  const batches = [];
  recursivelySplit(targets, settings, batches);
  return batches.map((items, index) => {
    const evidence = items.map(textOf).filter(Boolean).join('\n');
    return {
      id: `${options.prefix || 'batch'}:${index}`,
      kind: options.kind || 'fields',
      items,
      targetCount: items.length,
      numericValueCount: (evidence.match(MONEY) || []).length,
      payloadChars: evidence.length,
      evidence,
      blocked: items.some(item => item.oversizedEvidence) || evidence.length > settings.maxChars
    };
  });
}

export function planAdaptivePayrollPrompts(input = {}, options = {}) {
  const common = { maxTargets: options.maxTargets, maxChars: options.maxChars };
  const fieldBatches = createAdaptiveBatches(input.fields || [], { ...common, prefix: `${input.recordKey || 'unit'}:fields`, kind: 'fields' });
  const summaryBatches = createAdaptiveBatches(input.summaries || [], { ...common, prefix: `${input.recordKey || 'unit'}:summaries`, kind: 'summaries' });
  const ambiguousBatches = createAdaptiveBatches(input.ambiguous || [], { ...common, prefix: `${input.recordKey || 'unit'}:ambiguous`, kind: 'ambiguous' });
  return {
    recordKey: input.recordKey || null,
    maxTargets: Math.max(1, Number(options.maxTargets || DEFAULT_MAX_PROMPT_TARGETS)),
    maxChars: Math.max(500, Number(options.maxChars || DEFAULT_MAX_PROMPT_CHARS)),
    fieldBatches,
    summaryBatches,
    ambiguousBatches,
    batches: [...fieldBatches, ...summaryBatches, ...ambiguousBatches]
  };
}

export function assertPromptBatch(batch = {}, options = {}) {
  const maxTargets = Math.max(1, Number(options.maxTargets || DEFAULT_MAX_PROMPT_TARGETS));
  const maxChars = Math.max(500, Number(options.maxChars || DEFAULT_MAX_PROMPT_CHARS));
  if (!batch.id || !batch.kind || !batch.reason) throw new Error('PAYROLL_PROMPT_METADATA_REQUIRED');
  if (!batch.recordKey || !batch.region || !batch.strategy) throw new Error('PAYROLL_PROMPT_CONTEXT_REQUIRED');
  if (batch.blocked) throw new Error('PAYROLL_PROMPT_REQUIRES_SMALLER_VISUAL_REGION');
  if (!Number.isInteger(batch.targetCount) || batch.targetCount < 0 || batch.targetCount > maxTargets) {
    throw new Error(`PAYROLL_PROMPT_TARGET_LIMIT: ${batch.targetCount}/${maxTargets}`);
  }
  if (Number(batch.payloadChars || 0) > maxChars) throw new Error(`PAYROLL_PROMPT_SIZE_LIMIT: ${batch.payloadChars}/${maxChars}`);
  return batch;
}

export function promptBatchLog(batch = {}, extra = {}) {
  return {
    event: extra.event || 'payroll_prompt_batch',
    batchId: batch.id,
    recordKey: batch.recordKey || null,
    region: batch.region || null,
    kind: batch.kind,
    reason: batch.reason,
    targetCount: batch.targetCount,
    numericValueCount: batch.numericValueCount || 0,
    payloadChars: batch.payloadChars || 0,
    ...extra
  };
}

export function normalizeExtractionMetrics(extraction = {}, fallback = {}) {
  const deterministicItems = Number(extraction.deterministicItems ?? extraction.localItems ?? fallback.deterministicItems ?? 0);
  const aiRecoveredItems = Number(extraction.aiRecoveredItems ?? extraction.aiItems ?? fallback.aiRecoveredItems ?? 0);
  const aiValidatedItems = Number(extraction.aiValidatedItems ?? fallback.aiValidatedItems ?? 0);
  const declaredVisibleItems = Number(extraction.visibleItems ?? extraction.expectedCount ?? fallback.visibleItems ?? 0);
  const visibleItems = declaredVisibleItems > 0 ? declaredVisibleItems : deterministicItems + aiRecoveredItems;
  const legacyExtracted = Number(extraction.extractedCount ?? fallback.extractedItems ?? 0);
  const coveredItems = Math.min(visibleItems || Infinity, Math.max(legacyExtracted, deterministicItems + aiRecoveredItems));
  const pendingItems = Number(extraction.pendingItems ?? Math.max(0, visibleItems - (Number.isFinite(coveredItems) ? coveredItems : 0)));
  const coverage = visibleItems > 0 ? Math.max(0, Math.min(1, (visibleItems - pendingItems) / visibleItems)) : (pendingItems ? 0 : 1);
  return {
    visibleItems,
    deterministicItems,
    aiRecoveredItems,
    aiValidatedItems,
    pendingItems,
    coverage,
    plannedBatches: Number(extraction.plannedBatches ?? extraction.plannedPrompts ?? 0),
    executedPrompts: Number(extraction.executedPrompts ?? 0),
    strategy: extraction.strategy || fallback.strategy || null
  };
}
