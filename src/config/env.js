import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carrega .env do diretório atual e do diretório pai se existir
const environment = process.env.APP_ENV || (process.env.VERCEL ? 'production' : 'development');
const developmentEnvPath = path.resolve(process.cwd(), '.env.development');

if (environment === 'development' && fs.existsSync(developmentEnvPath)) {
  dotenv.config({ path: developmentEnvPath });
}

export const config = {
  environment,
  isProduction: environment === 'production',
  openaiApiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_SECRET_KEY || '',
  dataInputDir: process.env.DATA_INPUT_DIR 
    ? path.resolve(process.env.DATA_INPUT_DIR)
    : (fs.existsSync(path.resolve(process.cwd(), '../data_input'))
        ? path.resolve(process.cwd(), '../data_input')
        : path.resolve(process.cwd(), 'data_input')),
};

export function validateEnv() {
  if (!config.openaiApiKey) {
    throw new Error(
      'Chave de API da OpenAI (OPENAI_API_KEY ou OPENAI_SECRET_KEY) não foi encontrada nas variáveis de ambiente nem no arquivo .env.'
    );
  }
  return true;
}
