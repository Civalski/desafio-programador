import '@napi-rs/canvas';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

/**
 * Rasteriza páginas escaneadas para envio à OpenAI Vision. A função não
 * transcreve nem interpreta dados do documento.
 */
export async function rasterizePdfPages(filePath, pageNumbers, options = {}) {
  if (!pageNumbers.length) return new Map();

  try {
    const workerSource = `
      import { pdf } from 'pdf-to-img';
      const [filePath, pageNumbersJson, scale] = process.argv.slice(1);
      const document = await pdf(filePath, { scale: Number(scale) });
      const pages = JSON.parse(pageNumbersJson);
      const output = [];
      for (const pageNumber of pages) {
        const image = await document.getPage(pageNumber);
        if (!image) throw new Error('Page not rendered: ' + pageNumber);
        output.push([pageNumber, Buffer.from(image).toString('base64')]);
      }
      process.stdout.write(JSON.stringify(output));
    `;
    const runNode = promisify(execFile);
    const { stdout } = await runNode(process.execPath, [
      '--input-type=module', '--eval', workerSource, filePath,
      JSON.stringify(pageNumbers), String(options.scale ?? 4)
    ], {
      cwd: process.cwd(),
      env: process.env,
      maxBuffer: options.maxBuffer ?? 100 * 1024 * 1024
    });

    return new Map(JSON.parse(stdout).map(([pageNumber, base64]) => [pageNumber, {
      mimeType: 'image/png',
      dataUrl: `data:image/png;base64,${base64}`
    }]));
  } catch {
    console.warn('Rasterização isolada falhou; tentando modo alternativo.');
    try {
      const { pdf } = await import('pdf-to-img');
      const document = await pdf(filePath, { scale: Number(options.scale ?? 4) });
      const outputMap = new Map();
      for (const pageNumber of pageNumbers) {
        const image = await document.getPage(pageNumber);
        if (image) {
          const base64 = Buffer.from(image).toString('base64');
          outputMap.set(pageNumber, {
            mimeType: 'image/png',
            dataUrl: `data:image/png;base64,${base64}`
          });
        }
      }
      return outputMap;
    } catch {
      console.error('Falha ao rasterizar páginas do PDF.');
      throw new Error('Falha ao preparar páginas de imagem para a OpenAI Vision.');
    }
  }
}
