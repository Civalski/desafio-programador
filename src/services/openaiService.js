import OpenAI from 'openai';
import fs from 'fs';
import { config } from '../config/env.js';
import { normalizePayrollResponse } from '../normalizers/payrollNormalizer.js';
import { rasterizePdfPages } from '../utils/pdfExtractor.js';
import { detectFichaFinanceira, segmentAllMonthBlocks } from '../utils/fichaFinanceiraSegmenter.js';
import { analyzePageDensity, selectExtractionStrategy } from '../utils/densityAnalyzer.js';
import { PDFExtract } from 'pdf.js-extract';

const pdfExtract = new PDFExtract();

/**
 * PROMPT UNIFICADO: Extrai identificaÃ§Ã£o + competÃªncia + verbas em uma Ãºnica chamada.
 * Isso garante que a data (mÃªs/ano) sempre viaje junto das verbas, evitando o bug
 * onde a competÃªncia desaparece ao mesclar mÃºltiplas pÃ¡ginas.
 */
const PROMPT_UNIFIED = `Você é um especialista em OCR e estruturação de Folhas de Pagamento (Holerites) brasileiros.
Analise o texto desta página de holerite e extraia:
1. A COMPETÊNCIA (mês e ano de referência do holerite) — OBRIGATÓRIO. Procure por textos como "Competência:", "Mês/Ano:", "Período:", "Referência:", ou padrões como "05/2024".
2. Os dados do FUNCIONÁRIO e EMPRESA (cabeçalho).
3. TODAS as VERBAS da tabela principal (Proventos e Descontos), SEM OMITIR NENHUMA.

ATENÇÃO — LAYOUT DE COLUNAS DUPLAS:
- Holerites frequentemente têm DUAS colunas lado a lado: Proventos (esquerda) e Descontos (direita), separadas por espaço grande ou "|"
- Leia as DUAS colunas integralmente. Uma verba da coluna direita NÃO é o valor da coluna esquerda.
- Verbas com valor "0,00" são VÁLIDAS e devem ser incluídas — não as omita.
- Cada linha da tabela com código numérico é uma verba independente.

REGRAS CRÍTICAS:
- "competency.month" DEVE conter o número do mês (01-12) da folha de pagamento.
- "competency.year" DEVE conter o ano com 4 dígitos (ex: 2024).
- NÃO confunda data de admissão, emissão, nascimento ou pagamento com a competência.
- Para cada verba em "fields": "reference" = quantidade/horas/percentual; "value" = valor monetário R$.
- "type" de cada verba deve ser "provento" se é crédito/adição, ou "desconto" se é débito/subtração.
- NÃO inclua totais (Total Proventos, Total Descontos, Valor Líquido) em "fields".
- Se algum campo não existir no documento, use null ou string vazia — NUNCA invente dados.

Formato JSON estrito:
{
  "competency": { "month": "MM", "year": "YYYY", "paymentDate": "DD/MM/YYYY ou null" },
  "company": { "name": "Nome da Empresa", "cnpj": "CNPJ ou null", "branch": "Filial ou null" },
  "employee": {
    "name": "Nome do Funcionário", "cpf": "CPF ou null", "registration": "Matrícula ou null",
    "role": "Cargo ou null", "department": "Departamento ou null", "admissionDate": "DD/MM/YYYY ou null"
  },
  "bankInfo": { "bank": "Banco ou null", "agency": "Agência ou null", "account": "Conta ou null" },
  "fields": [
    { "code": "Código numérico ou null", "label": "Descrição exata da verba", "reference": "Qtd/Horas/% ou null", "value": "R$ (ex: 3.200,00)", "type": "provento ou desconto" }
  ]
}`;

/**
 * PROMPT DE TOTAIS: Extrai exclusivamente rodapÃ© (totais, bases, encargos).
 * Explicitamente instruÃ­do a NÃƒO repetir itens que jÃ¡ sÃ£o verbas individuais.
 */
const PROMPT_TOTALS = `Você é um especialista em OCR e estruturação de Folhas de Pagamento (Holerites) brasileiros.
Analise o texto desta página e extraia APENAS os dados do RODAPÉ da folha:
1. Os totais consolidados (Total Proventos, Total Descontos, Valor Líquido)
2. As bases de cálculo (Base INSS, Base IRRF, Base FGTS, FGTS do Mês etc.)

REGRAS CRÍTICAS:
- NÃO inclua verbas individuais (ex: Salário Base, Vale Transporte, Horas Extras) — apenas totais e bases.
- Se um item é uma verba individual da tabela principal, IGNORE-O aqui.
- "bases" deve conter APENAS linhas de rodapé como: Base INSS, Base IRRF, Base FGTS, FGTS do Mês, Alíquota IRRF.
- Procure o rodapé no final da página, após a tabela de verbas.
- Se um campo não existir no documento, use null — NUNCA invente valores.

Formato JSON estrito:
{
  "totals": {
    "totalAdditions": "Total de Proventos R$ ou null",
    "totalDeductions": "Total de Descontos R$ ou null",
    "netValue": "Valor Líquido R$ ou null"
  },
  "bases": [
    { "label": "Nome exato da base (ex: Base INSS)", "value": "Valor R$" }
  ]
}`;

const PROMPT_FICHA_FINANCEIRA_BLOCK = `Você é um especialista em OCR e estruturação de Fichas Financeiras e Holerites brasileiros.
Analise o texto deste bloco mensal da Ficha Financeira e extraia TODAS as verbas (Proventos e Descontos), Totais e Bases de Cálculo.

ATENÇÃO — LAYOUT EM COLUNAS:
A Ficha Financeira usa 2 a 3 colunas visuais. O texto pode aparecer assim:
  "001 Salario Base  220,00  1.800,00 | 511 INSS Normal  11%  198,00"
Nesse exemplo há DUAS verbas: código 001 (provento) e código 511 (desconto).
O separador "|" ou espaço grande indica troca de coluna — leia AMBOS os lados.

Antes de responder:
1. Conte todos os códigos numéricos visíveis — esse é o número mínimo de itens em "fields".
2. Percorra cada linha da esquerda para a direita, capturando TODAS as colunas.
3. Inclua sempre Salário Base / Salário Mensal / Vencimento Base quando visível.
4. REMUNERAÇÃO MÊS → retornar em "bases" com label "Remuneração do Mês".
5. Verbas com valor "0,00" são VÁLIDAS — inclua-as.

EXEMPLO DE ENTRADA:
  "001 Salario Base  220,00  1.800,00 | 511 INSS Normal  11%  198,00"
  "091 Hr Adic Pericul  146,67  290,92 | 040 Reembolso VR  1  150,00"
EXEMPLO DE SAÍDA:
{
  "fields": [
    {"code":"001","label":"Salario Base","reference":"220,00","value":"1.800,00","type":"provento"},
    {"code":"511","label":"INSS Normal","reference":"11%","value":"198,00","type":"desconto"},
    {"code":"091","label":"Hr Adic Pericul","reference":"146,67","value":"290,92","type":"provento"},
    {"code":"040","label":"Reembolso VR","reference":"1","value":"150,00","type":"provento"}
  ],
  "bases": [{"label":"Remuneração do Mês","value":"2.090,92"}],
  "totals": {"totalAdditions":"2.240,92","totalDeductions":"198,00","netValue":"2.042,92"}
}

ESTRUTURA JSON ESPERADA:
{
  "fields": [
    { "code": "código (ex: 001, 091, 511)", "label": "descrição (ex: Salário Base, Hr Adic Pericul, INSS Normal)", "reference": "horas/dias/% (ex: 220,00, 11%)", "value": "valor (ex: 1.620,65)", "type": "provento ou desconto" }
  ],
  "bases": [
    { "label": "nome da base (ex: Base INSS, Base IRRF, Base FGTS, FGTS do Mês, Remuneração do Mês)", "value": "valor (ex: 1.260,65)" }
  ],
  "totals": { "totalAdditions": "Total Proventos", "totalDeductions": "Total Descontos", "netValue": "Valor Líquido" }
}

REGRAS:
- Proventos (créditos) → "type": "provento". Descontos (débitos) → "type": "desconto".
- NÃO omita nenhuma verba, incluindo as de colunas à direita.
- Não resuma, não selecione apenas as principais verbas e não ignore itens com valor zero.
- NÃO invente dados.
`;

/**
 * PROMPT DE PASSAGEM ÃšNICA (SINGLE-PASS):
 * Extrai identificaÃ§Ã£o + competÃªncia + verbas + totais + bases em 1 Ãºnica chamada API.
 * Usado para economizar 50% de tokens em documentos de densidade baixa/mÃ©dia.
 */
const PROMPT_SINGLE_PASS = `Você é um especialista em OCR e estruturação de Folhas de Pagamento (Holerites) brasileiros.
Analise o texto desta página de holerite e extraia TODOS os dados estruturados:

1. COMPETÊNCIA (mês e ano de referência) — OBRIGATÓRIO. Procure por "Competência:", "Mês/Ano:", "Período:", "Referência:" ou padrão "05/2024".
2. DADOS DO FUNCIONÁRIO, EMPRESA E DADOS BANCÁRIOS.
3. TODAS AS VERBAS da tabela principal (Proventos e Descontos), SEM OMITIR NENHUMA.
4. TOTAIS DO RODAPÉ (Total Proventos, Total Descontos, Valor Líquido).
5. BASES DE CÁLCULO (Base INSS, Base IRRF, Base FGTS, FGTS do Mês, etc.).

ATENÇÃO — LAYOUT DE COLUNAS DUPLAS:
- Holerites frequentemente têm DUAS colunas lado a lado: Proventos (esquerda) e Descontos (direita).
- Uma linha como "001 Salário Base 3.200,00 | 511 INSS 352,00" representa DUAS verbas distintas.
- Leia as DUAS colunas. NÃO interprete o valor da coluna direita como referência da coluna esquerda.
- Verbas com valor "0,00" são VÁLIDAS e devem ser incluídas — não as omita.
- Conte os códigos numéricos visíveis: esse é o número mínimo de itens em "fields".

REGRAS CRÍTICAS:
- "competency.month" DEVE conter o mês (01-12) e "competency.year" o ano com 4 dígitos (ex: 2024).
- NÃO confunda data de admissão, emissão, nascimento ou pagamento com a competência.
- Para cada verba em "fields": "reference" = quantidade/horas/percentual; "value" = valor monetário R$.
- "type" de cada verba deve ser "provento" ou "desconto".
- NÃO inclua totais ou bases dentro do array "fields".
- Se um campo não existir, use null ou string vazia — NUNCA invente dados.

Formato JSON estrito:
{
  "competency": { "month": "MM", "year": "YYYY", "paymentDate": "DD/MM/YYYY ou null" },
  "company": { "name": "Nome da Empresa", "cnpj": "CNPJ ou null", "branch": "Filial ou null" },
  "employee": {
    "name": "Nome do Funcionário", "cpf": "CPF ou null", "registration": "Matrícula ou null",
    "role": "Cargo ou null", "department": "Departamento ou null", "admissionDate": "DD/MM/YYYY ou null"
  },
  "bankInfo": { "bank": "Banco ou null", "agency": "Agência ou null", "account": "Conta ou null" },
  "fields": [
    { "code": "Código numérico ou null", "label": "Descrição exata da verba", "reference": "Qtd/Horas/% ou null", "value": "Valor R$", "type": "provento ou desconto" }
  ],
  "totals": { "totalAdditions": "Total Proventos R$ ou null", "totalDeductions": "Total Descontos R$ ou null", "netValue": "Valor Líquido R$ ou null" },
  "bases": [
    { "label": "Nome exato da base (ex: Base INSS)", "value": "Valor R$" }
  ]
}`;

function parseCurrency(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = String(value).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasConsistentPayrollTotals(totals, tolerance = 0.02) {
  const additions = parseCurrency(totals?.totalAdditions);
  const deductions = parseCurrency(totals?.totalDeductions);
  const netValue = parseCurrency(totals?.netValue);
  return additions !== null && deductions !== null && netValue !== null
    && Math.abs((additions - deductions) - netValue) <= tolerance;
}
export function validateFichaExtraction(rawText, parsed = {}) {
  const expectedCodes = new Set();
  for (const line of String(rawText || '').split('\n')) {
    for (const match of line.matchAll(/(?:^|\|)\s*(\d{1,4})\s+[A-Za-zÀ-ÿ]/g)) expectedCodes.add(match[1]);
  }
  const extractedCodes = new Set((parsed.fields || []).map(field => String(field.code || '').trim()).filter(Boolean));
  const missingCodes = [...expectedCodes].filter(code => !extractedCodes.has(code));
  const expectsTotals = /TOT\.?\s*RENDIMENTOS|TOTAL\s*DESCONTOS|SALARIO\s*LIQUIDO/i.test(rawText || '');
  const hasTotals = Object.values(parsed.totals || {}).some(value => value !== null && value !== undefined && value !== '');
  const expectsBases = /BASE\s*DE\s*CALCULO|BASEDECALCULO|VALOR\s*DO\s*FGTS/i.test(rawText || '');
  const hasBases = Array.isArray(parsed.bases) && parsed.bases.length > 0;
  const coverage = expectedCodes.size ? extractedCodes.size / expectedCodes.size : (extractedCodes.size ? 1 : 0);
  const warnings = [];
  if (missingCodes.length) warnings.push(`Códigos não extraídos: ${missingCodes.join(', ')}`);
  if (expectsTotals && !hasTotals) warnings.push('Totais visíveis no bloco não foram extraídos.');
  if (expectsBases && !hasBases) warnings.push('Bases visíveis no bloco não foram extraídas.');
  return { valid: coverage >= 0.8 && (!expectsTotals || hasTotals) && (!expectsBases || hasBases), coverage, missingCodes, warnings };
}

/**
 * Tenta inferir a competência (mês/ano) a partir do texto bruto da página usando padrões comuns.
 * Usado como fallback quando a IA não retorna month/year identificáveis.
 *
 * @param {string} text  Texto bruto da página (com layout espacial preservado)
 * @returns {{ month: string, year: string } | null}
 */
export function inferCompetencyFromText(text) {
  if (!text || typeof text !== 'string') return null;

  const patterns = [
    // "Competência: 05/2024" ou "Competência: 05/24"
    /compet[eê]ncia\s*[:\-]?\s*(0?[1-9]|1[0-2])[\/\-](20\d{2}|\d{2})/i,
    // "Período: 05/2024"
    /per[íi]odo\s*[:\-]?\s*(0?[1-9]|1[0-2])[\/\-](20\d{2}|\d{2})/i,
    // "Mês/Ano: 05/2024" ou "Mês/Ano: 05/24"
    /m[eê]s[\/\-]?ano\s*[:\-]?\s*(0?[1-9]|1[0-2])[\/\-](20\d{2}|\d{2})/i,
    // "Referência: 05/2024"
    /refer[eê]ncia\s*[:\-]?\s*(0?[1-9]|1[0-2])[\/\-](20\d{2}|\d{2})/i,
    // Padrão numérico solto "05/2024" — precedido por espaço ou início de linha, 4 dígitos no ano
    /(?:^|\s)(0[1-9]|1[0-2])\/(20\d{2})(?:\s|$)/m,
  ];

  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m) {
      let month = m[1].padStart(2, '0');
      let year = m[2].length === 2 ? `20${m[2]}` : m[2];
      const monthNum = parseInt(month, 10);
      const yearNum = parseInt(year, 10);
      if (monthNum >= 1 && monthNum <= 12 && yearNum >= 1990 && yearNum <= 2100) {
        return { month, year };
      }
    }
  }
  return null;
}

export class OpenAIService {
  constructor(apiKey = config.openaiApiKey) {
    this.apiKey = apiKey;
    this.client = null;
    this.initClient();
  }

  initClient() {
    const key = this.apiKey || process.env.OPENAI_SECRET_KEY || process.env.OPENAI_API_KEY;
    if (!key) {
      console.warn('âš ï¸ Alerta: OPENAI_SECRET_KEY nÃ£o configurada.');
      return;
    }

    try {
      this.client = new OpenAI({ apiKey: key });
    } catch (error) {
      console.error('âŒ Erro ao inicializar o cliente OpenAI:', error.message);
    }
  }

  isReady() {
    const key = this.apiKey || process.env.OPENAI_SECRET_KEY || process.env.OPENAI_API_KEY;
    return Boolean(key && this.client);
  }

  getClient() {
    return this.client;
  }

  /**
   * Executa chamada com modelo primário e fallback explícitos por configuração.
   */
  async generateCompletionWithFallback(messages, options = {}) {
    const models = [...new Set([config.openaiPayrollModel, config.openaiPayrollFallbackModel].filter(Boolean))];
    let lastError;

    for (const [modelIndex, model] of models.entries()) {
      try {
        console.log(`ðŸ¤– Executando requisiÃ§Ã£o OpenAI com modelo: ${model}`);
        const requestParams = {
          model,
          messages,
          response_format: { type: 'json_object' },
          ...options
        };

        if (!model.includes('gpt-5') && !model.includes('luna') && !model.includes('nano') && !model.startsWith('o')) {
          requestParams.temperature = 0.1;
        }

        console.log(JSON.stringify({ event: 'openai_attempt', model, attempt: modelIndex + 1 }));
        const response = await this.client.chat.completions.create(requestParams);
        console.log(JSON.stringify({ event: 'openai_success', model, attempt: modelIndex + 1 }));
        return response.choices[0]?.message?.content || '{}';
      } catch (err) {
        console.warn(`âš ï¸ Modelo OpenAI ${model} falhou ou sofreu limitaÃ§Ã£o (${err.message}). Tentando modelo seguinte...`);
        console.warn(JSON.stringify({ event: 'openai_fallback', model, attempt: modelIndex + 1, reason: err.message }));
        lastError = err;
      }
    }
    throw lastError;
  }

  /**
   * Extrai o conteÃºdo preservando colunas espaciais separado por pÃ¡ginas
   */
  async extractPdfTextPages(filePath) {
    const data = await new Promise((resolve, reject) => {
      pdfExtract.extract(filePath, {}, (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });

    return data.pages.map((p, idx) => {
      const pageNum = idx + 1;
      const linesMap = new Map();

      (p.content || []).forEach(item => {
        if (!item.str.trim()) return;
        const yBucket = Math.round(item.y / 4) * 4;
        if (!linesMap.has(yBucket)) linesMap.set(yBucket, []);
        linesMap.get(yBucket).push(item);
      });

      const sortedY = Array.from(linesMap.keys()).sort((a, b) => a - b);
      const textLines = sortedY.map(y => {
        const lineItems = linesMap.get(y).sort((a, b) => a.x - b.x);
        let lineStr = '';
        for (let i = 0; i < lineItems.length; i++) {
          if (i > 0) {
            const prev = lineItems[i - 1];
            const curr = lineItems[i];
            const gap = curr.x - (prev.x + (prev.width || 0));
            lineStr += gap > 15 ? '  |  ' : ' ';
          }
          lineStr += lineItems[i].str;
        }
        return lineStr;
      });

      return {
        pageNum,
        text: textLines.join('\n'),
        rawContent: p.content || [],
        density: analyzePageDensity(p.content || [])
      };
    });
  }

  /**
   * Envia o PDF de Holerite (Payroll) para a API da OpenAI e retorna o DTO normalizado.
   * Processa pÃ¡gina por pÃ¡gina para garantir 100% de cobertura sem omissÃ£o de verbas.
   */
  async parsePayroll(filePath, options = {}) {
    const onProgress = options.onProgress || (() => {});
    const onPageCompleted = options.onPageCompleted || (() => {});
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo nÃ£o encontrado: ${filePath}`);
      }

      if (!this.isReady()) {
        throw new Error('OPENAI_NOT_CONFIGURED: configure OPENAI_API_KEY ou OPENAI_SECRET_KEY para transcrever documentos.');
      }

      onProgress({ current: 0, total: 0, percentage: 5, message: 'Lendo arquivo PDF e analisando layout...', log: 'Arquivo PDF carregado no servidor. Analisando estrutura...' });

      try {
          // Extrai o PDF bruto via pdfExtract para verificar se Ã© Ficha Financeira
          const pdfRawData = await new Promise((resolve, reject) => {
            pdfExtract.extract(filePath, {}, (err, res) => {
              if (err) return reject(err);
              resolve(res);
            });
          });

          const isFicha = detectFichaFinanceira(pdfRawData.pages);

          if (isFicha) {
            const completedResultKeys = new Set(options.completedResultKeys || []);
            const blocks = segmentAllMonthBlocks(pdfRawData.pages)
              .map(block => ({ ...block, resultKey: `page:${block.pageNum}:block:${block.blockIndex}` }))
              .filter(block => !completedResultKeys.has(block.resultKey));
            console.log(`ðŸ“„ Documento identificado como Ficha Financeira: ${blocks.length} blocos mensais detectados.`);
            onProgress({
              current: 0,
              total: blocks.length,
              percentage: 10,
              message: `Ficha Financeira detectada (${blocks.length} blocos mensais)`,
              log: `Ficha Financeira identificada: ${blocks.length} bloco(s) mensais para extracao.`
            });

            let completedBlocks = 0;
            const blockPromises = blocks.map(async (block, bIdx) => {
              try {
                console.log(`ðŸ” [OpenAI] Extraindo bloco ${bIdx + 1}/${blocks.length}: CompetÃªncia ${block.month}/${block.year} (PÃ¡g ${block.pageNum})...`);

                const completionJson = await this.generateCompletionWithFallback([
                  { role: 'system', content: PROMPT_FICHA_FINANCEIRA_BLOCK },
                  {
                    role: 'user',
                    content: `COMPETÃŠNCIA DO BLOCO: ${block.month}/${block.year}\n\nTEXTO DO BLOCO:\n${block.rawText}`
                  }
                ]);

                let parsed = {};
                try {
                  parsed = JSON.parse(completionJson);
                } catch {
                  parsed = {};
                }

                let validation = validateFichaExtraction(block.rawText, parsed);
                if (!validation.valid) {
                  console.warn(JSON.stringify({ event: 'ficha_validation_retry', resultKey: block.resultKey, attempt: 1, coverage: validation.coverage, warnings: validation.warnings }));
                  const retryJson = await this.generateCompletionWithFallback([
                    { role: 'system', content: PROMPT_FICHA_FINANCEIRA_BLOCK },
                    { role: 'user', content: `COMPETÊNCIA DO BLOCO: ${block.month}/${block.year}\n\nREVISÃO OBRIGATÓRIA: confira cada código, total e base visível. Problemas anteriores: ${validation.warnings.join(' ')}\n\nTEXTO DO BLOCO:\n${block.rawText}` }
                  ]);
                  try { parsed = JSON.parse(retryJson); } catch { parsed = {}; }
                  validation = validateFichaExtraction(block.rawText, parsed);
                }

                const fields = (parsed.fields || []).map(f => ({
                  code: f.code || '',
                  label: f.label || '',
                  reference: f.reference || '',
                  value: f.value || '',
                  type: f.type || 'provento'
                }));

                const result = {
                  page: block.pageNum,
                  blockIndex: block.blockIndex,
                  resultKey: block.resultKey,
                  month: block.month,
                  year: block.year,
                  fields,
                  totals: parsed.totals || {},
                  bases: parsed.bases || [],
                  extractionValidation: validation
                };
                await onPageCompleted(result);

                completedBlocks++;
                const pct = Math.min(95, Math.round(10 + (completedBlocks / blocks.length) * 85));
                  log: `Bloco ${block.month}/${block.year}: ${fields.length} verbas e ${result.bases.length} bases extraidas.`
                onProgress({
                  current: completedBlocks,
                  total: blocks.length,
                  percentage: pct,
                  message: `Bloco ${completedBlocks} de ${blocks.length} concluÃ­do (${block.month}/${block.year})`,
                  log: `Bloco ${block.month}/${block.year}: ${fields.length} verbas e ${result.bases.length} bases extraidas.`
                });

                return result;
              } catch (err) {
                console.warn(`âš ï¸ Falha na extraÃ§Ã£o do bloco ${block.month}/${block.year} via OpenAI:`, err.message);
                completedBlocks++;
                onProgress({
                  current: completedBlocks,
                  total: blocks.length,
                  message: `Falha na extraÃ§Ã£o do bloco ${block.month}/${block.year}`,
                  log: `Erro no bloco ${block.month}/${block.year}: ${err.message}`
                });
                return null;
              }
            });

            const blockOutcomes = await Promise.all(blockPromises);
            const extractedBlocksRaw = blockOutcomes.filter(Boolean);
            if (blockOutcomes.some(result => !result)) throw new Error('OPENAI_EXTRACTION_PARTIAL: um ou mais blocos falharam; retomando somente os pendentes.');
            const allBlocksRaw = [...(options.completedResults || []), ...extractedBlocksRaw];
            const parsedObj = { pages: allBlocksRaw };
            const normalized = normalizePayrollResponse(parsedObj);
            const validationWarnings = allBlocksRaw.flatMap(block => (block.extractionValidation?.valid ? [] : block.extractionValidation?.warnings || []).map(message => `${block.resultKey}: ${message}`));
            if (validationWarnings.length) normalized.audit = { ...(normalized.audit || {}), status: 'review_required', warnings: [...(normalized.audit?.warnings || []), ...validationWarnings] };

            if (normalized.pages?.length > 0) {
              return normalized;
            }
          }

          // Caso padrÃ£o (Holerite comum por pÃ¡gina)
          const completedResultKeys = new Set(options.completedResultKeys || []);
          const pdfPages = (await this.extractPdfTextPages(filePath)).filter(page => !completedResultKeys.has(`page:${page.pageNum}`));
          const totalPages = pdfPages.length;
          const scannedPageNumbers = pdfPages
            .filter(page => selectExtractionStrategy(page.density, false) === 'VISION_SINGLE_PASS')
            .map(page => page.pageNum);
          let scannedImages = new Map();

          if (scannedPageNumbers.length) {
            onProgress({
              current: 0,
              total: totalPages,
              percentage: 10,
              message: 'Imagem escaneada detectada. Convertendo paginas para analise visual...',
              log: 'Imagem escaneada detectada. Convertendo paginas para analise visual...'
            });
            scannedImages = await rasterizePdfPages(filePath, scannedPageNumbers, { scale: config.visionScale });
          }
          console.log(`ðŸ“„ Processando ${totalPages} pÃ¡ginas de holerite em paralelo via OpenAI...`);
          onProgress({
            current: 0,
            total: totalPages,
            percentage: 10,
            message: `PDF possui ${totalPages} pÃ¡gina(s). Extraindo dados via OpenAI...`,
            log: `PDF possui ${totalPages} pagina(s). Iniciando analise com IA...`
          });

          let completedPages = 0;
          const pagePromises = pdfPages.map(async (pageObj) => {
            try {
              const density = pageObj.density || analyzePageDensity(pageObj.rawContent);
              const strategy = selectExtractionStrategy(density, false);
              const isVision = strategy === 'VISION_SINGLE_PASS';
              let inputContent = isVision
                ? [
                    { type: 'text', text: 'Analise esta imagem de holerite e retorne somente o JSON solicitado.' },
                    { type: 'image_url', image_url: { url: scannedImages.get(pageObj.pageNum)?.dataUrl, detail: 'high' } }
                  ]
                : pageObj.text;
              const runPrompt = async (systemPrompt) => {
                const completionJson = await this.generateCompletionWithFallback([
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: inputContent }
                ]);
                try {
                  return JSON.parse(completionJson);
                } catch {
                  return {};
                }
              };

              let unifiedData = {};
              let totalsData = {};

              if (strategy === 'SINGLE_PASS' || isVision) {
                const source = isVision ? 'VISION_SINGLE_PASS' : 'SINGLE_PASS';
                console.log(`Pagina ${pageObj.pageNum} (${density.charCount} chars, ${source}): executando uma chamada IA.`);
                const singlePassData = await runPrompt(PROMPT_SINGLE_PASS);
                unifiedData = singlePassData || {};
                totalsData = {
                  totals: singlePassData.totals || {},
                  bases: singlePassData.bases || []
                };

                if (!hasConsistentPayrollTotals(totalsData.totals)) {
                  console.log(`Pagina ${pageObj.pageNum}: totais divergentes ou ausentes; refinando rodape.`);
                  const refinedTotals = await runPrompt(PROMPT_TOTALS);
                  totalsData = refinedTotals || totalsData;
                }
                if (isVision && !(unifiedData.fields || []).length) {
                  console.warn(JSON.stringify({ event: 'vision_low_coverage_retry', page: pageObj.pageNum, scale: Math.max(4, config.visionScale * 2) }));
                  const highResolution = await rasterizePdfPages(filePath, [pageObj.pageNum], { scale: Math.max(4, config.visionScale * 2) });
                  inputContent = [
                    { type: 'text', text: 'Revise esta imagem em maior resolução. Extraia todas as verbas, totais e bases e retorne somente o JSON solicitado.' },
                    { type: 'image_url', image_url: { url: highResolution.get(pageObj.pageNum)?.dataUrl, detail: 'high' } }
                  ];
                  const retried = await runPrompt(PROMPT_SINGLE_PASS);
                  unifiedData = retried || unifiedData;
                  totalsData = { totals: retried?.totals || totalsData.totals, bases: retried?.bases || totalsData.bases };
                }
              } else {
                console.log(`Pagina ${pageObj.pageNum} (${density.charCount} chars, DUAL_PASS): extraindo dados e totais.`);
                const [uData, tData] = await Promise.all([
                  runPrompt(PROMPT_UNIFIED),
                  runPrompt(PROMPT_TOTALS)
                ]);
                unifiedData = uData || {};
                totalsData = tData || {};
              }
              // Lê competência do formato novo (competency.month/year)
              const competency = unifiedData.competency || {};
              let month = competency.month || unifiedData.month || '';
              let year = competency.year || unifiedData.year || '';
              const paymentDate = competency.paymentDate || unifiedData.paymentDate || null;

              // Fallback: se a IA não identificou a competência, tenta inferir do texto bruto
              if ((!month || !year) && !isVision && pageObj.text) {
                const inferred = inferCompetencyFromText(pageObj.text);
                if (inferred) {
                  month = month || inferred.month;
                  year = year || inferred.year;
                  console.log(`📅 Página ${pageObj.pageNum}: competência inferida localmente → ${month}/${year}`);
                }
              }

              // Normaliza fields para garantir campo 'type'
              const fields = (unifiedData.fields || []).map(f => ({
                code: f.code || '',
                label: f.label || '',
                reference: f.reference || '',
                value: f.value || '',
                type: f.type || 'provento'
              }));

              const result = {
                page: pageObj.pageNum,
                resultKey: `page:${pageObj.pageNum}`,
                month,
                year,
                paymentDate,
                company: unifiedData.company || null,
                employee: unifiedData.employee || null,
                bankInfo: unifiedData.bankInfo || null,
                fields,
                totals: totalsData.totals || {},
                bases: totalsData.bases || []
              };
              await onPageCompleted(result);

              completedPages++;
              const pct = Math.min(95, Math.round(10 + (completedPages / totalPages) * 85));
              console.log(`âœ… PÃ¡gina ${pageObj.pageNum}: CompetÃªncia ${month}/${year} | Verbas: ${fields.length} | Bases: ${result.bases.length}`);
              onProgress({
                current: completedPages,
                total: totalPages,
                percentage: pct,
                message: `PÃ¡gina ${completedPages} de ${totalPages} concluÃ­da`,
                log: `${isVision ? 'Visao IA' : 'IA'} - Pagina ${pageObj.pageNum}: ${fields.length} verbas extraidas via modelo.`
              });

              return result;
            } catch (err) {
              console.warn(`âš ï¸ Falha na extraÃ§Ã£o da pÃ¡gina ${pageObj.pageNum} via OpenAI:`, err.message);
              completedPages++;
              onProgress({
                current: completedPages,
                total: totalPages,
                message: `Falha na extraÃ§Ã£o da pÃ¡gina ${pageObj.pageNum}`,
                log: `Erro na pagina ${pageObj.pageNum}: ${err.message}`
              });
              return null;
            }
          });

          const pageOutcomes = await Promise.all(pagePromises);
          const extractedPagesRaw = pageOutcomes.filter(Boolean);
          if (pageOutcomes.some(result => !result)) throw new Error('OPENAI_EXTRACTION_PARTIAL: uma ou mais páginas falharam; retomando somente as pendentes.');
          if (scannedPageNumbers.length && extractedPagesRaw.length === 0) {
            throw new Error('VISION_EXTRACTION_UNAVAILABLE: nenhuma pagina escaneada foi extraida pela API.');
          }
          const parsedObj = { pages: [...(options.completedResults || []), ...extractedPagesRaw] };
          const normalized = normalizePayrollResponse(parsedObj);

          if (normalized.pages?.[0]?.fields?.length) {
            return normalized;
          }
          throw new Error('OPENAI_EXTRACTION_EMPTY: a OpenAI não retornou verbas válidas para o documento.');
        } catch (apiErr) {
          if (apiErr.message?.startsWith('OPENAI_') || apiErr.message?.startsWith('VISION_EXTRACTION_UNAVAILABLE:')) throw apiErr;
          throw new Error(`OPENAI_EXTRACTION_FAILED: ${apiErr.message}`);
        }

    } catch (error) {
      console.error('Erro no processamento do documento.');
      if (error.message?.includes('VISION_EXTRACTION') || error.message?.includes('OPENAI') || error.message?.includes('PDF escaneado')) {
        throw error;
      }
      throw new Error('Não foi possível extrair o documento com segurança.');
    }
  }

  async parseDocument(filePath, documentType, options = {}) {
    if (documentType === 'payroll') {
      return this.parsePayroll(filePath, options);
    } else {
      throw new Error(`Tipo de documento nÃ£o suportado: ${documentType}`);
    }
  }
}

export const openaiService = new OpenAIService();
