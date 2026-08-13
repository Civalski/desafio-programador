import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export class TemporaryPdfFiles {
  async withPdf(id, content, action) {
    const filePath = path.join(os.tmpdir(), `quick_filler_${id}_${randomUUID()}.pdf`);
    await fs.writeFile(filePath, content);
    try { return await action(filePath); } finally { await fs.rm(filePath, { force: true }); }
  }
}
