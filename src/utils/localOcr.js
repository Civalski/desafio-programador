import portugueseData from '@tesseract.js-data/por';

let workerPromise;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker(
      portugueseData.code,
      undefined,
      { langPath: portugueseData.langPath, gzip: portugueseData.gzip }
    ));
  }
  return workerPromise;
}

export async function recognizePayrollImage(dataUrl, options = {}) {
  if (!dataUrl) return { text: '', confidence: 0, words: [] };
  const worker = await getWorker();
  const result = await worker.recognize(dataUrl, {}, { text: true, blocks: true });
  const data = result?.data || {};
  return {
    text: data.text || '',
    confidence: Number(data.confidence || 0) / 100,
    words: (data.blocks || []).flatMap(block => block.paragraphs || []).flatMap(paragraph => paragraph.lines || []).flatMap(line => line.words || []).map(word => ({
      text: word.text, confidence: Number(word.confidence || 0) / 100, bbox: word.bbox
    })),
    evidenceType: options.evidenceType || 'ocr'
  };
}

export async function terminateLocalOcr() {
  if (!workerPromise) return;
  const worker = await workerPromise;
  await worker.terminate();
  workerPromise = undefined;
}
