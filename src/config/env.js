import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega .env do diretório atual e do diretório pai se existir
const environment = process.env.APP_ENV || (process.env.VERCEL ? 'production' : 'development');
const localEnvPath = path.resolve(process.cwd(), '.env.local');
const developmentEnvPath = path.resolve(process.cwd(), '.env.development');

if (environment === 'development') {
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
  }
  if (fs.existsSync(developmentEnvPath)) {
    dotenv.config({ path: developmentEnvPath });
  }
}

export const config = {
  environment,
  isProduction: environment === 'production',
  openaiApiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_SECRET_KEY || '',
  openaiPayrollModel: process.env.OPENAI_PAYROLL_MODEL || 'gpt-5.6-luna',
  openaiPayrollFallbackModel: process.env.OPENAI_PAYROLL_FALLBACK_MODEL || 'gpt-5.6-sol',
  visionScale: Number(process.env.OPENAI_VISION_SCALE || 2),
  openaiConcurrency: Math.max(1, Number(process.env.OPENAI_CONCURRENCY || 3)),
  payrollBatchSize: Math.max(1, Number(process.env.PAYROLL_BATCH_SIZE || 6)),
  ocrMinimumConfidence: Number(process.env.OCR_MINIMUM_CONFIDENCE || 0.72),
  dataInputDir: process.env.DATA_INPUT_DIR 
    ? path.resolve(process.env.DATA_INPUT_DIR)
    : path.resolve(process.cwd(), 'exemplos'),
};

export function validateEnv() {
  if (!config.openaiApiKey) {
    throw new Error(
      'Chave de API da OpenAI (OPENAI_API_KEY ou OPENAI_SECRET_KEY) não foi encontrada nas variáveis de ambiente nem no arquivo .env.'
    );
  }
  return true;
}
