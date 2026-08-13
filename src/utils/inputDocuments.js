import fs from 'fs';
import path from 'path';
import { config } from '../config/env.js';

/**
 * Utilitário para localizar e listar os documentos em exemplos/ sem realizar a leitura/OCR.
 */
export function listInputDocuments() {
  const baseDir = config.dataInputDir;
  const result = {
    baseDir,
    exists: fs.existsSync(baseDir),
    categories: {
      payroll: [],
      other: []
    }
  };

  if (!result.exists) {
    return result;
  }

  const readDirRecursive = (dir, category = 'other') => {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        const subCat = category;
        readDirRecursive(fullPath, subCat);
      } else if (item.isFile() && item.name.toLowerCase().endsWith('.pdf')) {
        const targetCategory = item.name.toLowerCase().startsWith('holerite-') ? 'payroll' : 'other';
        result.categories[targetCategory].push({
          name: item.name,
          relativePath: path.relative(baseDir, fullPath),
          fullPath
        });
      }
    }
  };

  readDirRecursive(baseDir);
  return result;
}
