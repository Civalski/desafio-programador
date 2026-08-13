import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PAYROLL_SNAPSHOT_PATH = path.join(__dirname, 'payroll-snapshot.json');

/**
 * Carregador de mocks e snapshots locais para desenvolvimento sem uso de cota.
 */
export function getMockData(filePath, documentType) {
  const fileName = path.basename(filePath || '');

  if (documentType === 'payroll') {
    if (fs.existsSync(PAYROLL_SNAPSHOT_PATH)) {
      try {
        const raw = fs.readFileSync(PAYROLL_SNAPSHOT_PATH, 'utf-8');
        const snapshot = JSON.parse(raw);
        return {
          ...snapshot,
          fileName
        };
      } catch (err) {
        console.warn('⚠️ Falha ao ler payroll-snapshot.json, usando fallback mock.');
      }
    }

    return {
      pages: [
        {
          pageNumber: 1,
          year: '2024',
          month: '05',
          items: [
            { code: '0001', label: 'Salário Base', reference: '220,00', value: '3.500,00' },
            { code: '0900', label: 'INSS', reference: '11,00%', value: '432,35' },
            { code: '', label: 'Base INSS', reference: '', value: '3.500,00', isBase: true },
            { code: '', label: 'Valor Líquido', reference: '', value: '3.067,65', isBase: true }
          ]
        }
      ]
    };
  }

  if (documentType === 'time_card') {
    if (fs.existsSync(TIMECARD_SNAPSHOT_PATH)) {
      try {
        const raw = fs.readFileSync(TIMECARD_SNAPSHOT_PATH, 'utf-8');
        const snapshot = JSON.parse(raw);
        return {
          ...snapshot,
          fileName
        };
      } catch (err) {
        console.warn('⚠️ Falha ao ler timecard-snapshot.json, usando fallback mock.');
      }
    }

    return {
      pages: [
        {
          pageNumber: 1,
          days: [
            {
              date_raw: '01/05/2024',
              punches: [
                { kind: 'IN', time_raw: '08:00' },
                { kind: 'OUT', time_raw: '17:00' }
              ]
            }
          ]
        }
      ]
    };
  }

  throw new Error(`Tipo de documento não suportado para mock: ${documentType}`);
}
