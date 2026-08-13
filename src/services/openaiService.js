import OpenAI from 'openai';
import fs from 'fs';
import { config } from '../config/env.js';
import { normalizePayrollResponse } from '../normalizers/payrollNormalizer.js';
import { rasterizePdfPages } from '../utils/pdfExtractor.js';
import { detectFichaFinanceira, segmentAllMonthBlocks, extractBlockDataLocal, buildSpatialText } from '../utils/fichaFinanceiraSegmenter.js';
import { segmentPagePayslips } from '../utils/payslipSegmenter.js';
import { analyzePageDensity, selectExtractionStrategy } from '../utils/densityAnalyzer.js';
import { PDFExtract } from 'pdf.js-extract';
import { buildPayrollInventory, planPayrollPromptBatches, auditPayrollCoverage, reconcilePayrollExtractions } from '../utils/payrollInventory.js';
import { extractPayrollLocal } from '../utils/localPayrollExtractor.js';
import { recognizePayrollImage } from '../utils/localOcr.js';
import { catalogHintsForLabels } from '../utils/payrollCatalog.js';
import { assertPromptBatch, createAdaptiveBatches, promptBatchLog } from '../utils/adaptivePromptPlanner.js';

const pdfExtract = new PDFExtract();

export function hasVerifiedAiExecution(result = {}) {
  const extraction = result.extraction || result.extractionValidation || {};
  return Number(extraction.executedPrompts || 0) > 0;
}

export function selectVerifiedAiCheckpoints(results = []) {
  return results.filter(hasVerifiedAiExecution);
}

export function assertVerifiedAiExecution(results = []) {
  const invalidResults = results.filter(result => !hasVerifiedAiExecution(result));
  if (invalidResults.length) {
    throw new Error(`OPENAI_REQUIRED_EXECUTION_MISSING: ${invalidResults.length} unidade(s) sem chamada de IA confirmada.`);
  }
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

const PROMPT_IDENTITY_AGENT = `Você extrai somente identificação e competência de holerites brasileiros.
Confirme os valores encontrados localmente contra o texto. Não extraia verbas. Não invente.
Retorne JSON: {"competency":{"month":"MM","year":"YYYY","paymentDate":null},"company":{},"employee":{},"bankInfo":{}}.`;

const PROMPT_FIELDS_AGENT = `Você é o agente de verbas de um pipeline auditável de holerites.
Extraia exatamente todas as linhas solicitadas, inclusive valores 0,00. Preserve o rótulo original.
reference é quantidade/horas/percentual e value é o valor monetário. Não inclua bases ou totais.
FGTS meramente informativo/patronal não é desconto. Não invente linhas ausentes.
Retorne somente JSON: {"fields":[{"code":"","label":"","reference":"","value":"","type":"provento|desconto"}]} .`;

const PROMPT_SUMMARY_AGENT = `Você é o agente de rodapé de holerites brasileiros.
Extraia somente bases, totalizadores, quantidades, percentuais e valores patronais/informativos visíveis.
FGTS empresa/depósito é informativo, não desconto. Não repita verbas e não invente.
Retorne somente JSON: {"bases":[{"label":"","value":"","kind":"base|quantidade|percentual|informativo_patronal"}],"totals":{"totalAdditions":null,"totalDeductions":null,"netValue":null}}.`;

const PROMPT_AUDIT_AGENT = `Você é o agente final de recuperação de cobertura. Receba apenas lacunas apontadas pela auditoria e a evidência correspondente.
Retorne somente os itens realmente visíveis, preservando rótulo, código e valor. Não invente.
JSON: {"fields":[],"bases":[],"totals":{}}.`;

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

function classifyStandardPayrollType(text = '') {
  const normalized = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\bacerto\b|suplementar|complementar/.test(normalized)) return 'suplementar';
  if (/folha de pagamento:\s*\|?\s*mes\b/.test(normalized)) return 'normal';
  if (/participacao.*(?:lucro|resultado)|\bplr\b/.test(normalized)) return 'plr';
  if (/folha de pagamento:[^\n]*(?:13|decimo)|\b13\s*(?:o\s+salario|salario)|decimo terceiro/.test(normalized.slice(0, 600))) return 'decimo_terceiro';
  return 'normal';
}

export function buildStandardProcessingUnits(sourcePages = []) {
  return sourcePages.flatMap(page => {
    const regions = segmentPagePayslips(page.rawContent, page.pageInfo || { num: page.pageNum, height: 842 });
    if (regions.length <= 1 || regions[0]?.isFallback) {
      return [{ ...page, resultKey: `page:${page.pageNum}`, payrollType: classifyStandardPayrollType(page.text) }];
    }
    return regions.map(region => {
      const text = buildSpatialText(region.items || []);
      return {
        ...page,
        text,
        rawContent: region.items || [],
        density: analyzePageDensity(region.items || []),
        blockIndex: region.index,
        sourceRegion: `region:${region.index}`,
        resultKey: `page:${page.pageNum}:region:${region.index}`,
        payrollType: classifyStandardPayrollType(text)
      };
    });
  });
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
        const response = await this.client.chat.completions.create(requestParams, {
          timeout: config.openaiTimeoutMs,
          maxRetries: 0
        });
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

  async executePayrollPrompt(messages, batch, options = {}) {
    assertPromptBatch(batch, { maxTargets: config.payrollBatchSize, maxChars: config.payrollPromptMaxChars });
    const startedAt = Date.now();
    console.log(JSON.stringify(promptBatchLog(batch, { event: 'payroll_prompt_started', attempt: options.attempt || 1 })));
    try {
      const result = await this.generateCompletionWithFallback(messages, options.completionOptions || {});
      console.log(JSON.stringify(promptBatchLog(batch, { event: 'payroll_prompt_completed', durationMs: Date.now() - startedAt, result: 'success' })));
      return result;
    } catch (error) {
      console.warn(JSON.stringify(promptBatchLog(batch, { event: 'payroll_prompt_completed', durationMs: Date.now() - startedAt, result: 'error', errorCode: error.code || error.name || 'ERROR' })));
      throw error;
    }
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
        pageInfo: p.pageInfo || null,
        density: analyzePageDensity(p.content || [])
      };
    });
  }

  async runHybridPageAgents(pageObj, options = {}) {
    const isVision = Boolean(options.isVision);
    const imageDataUrl = options.imageDataUrl || null;

    // Tesseract depende de worker e arquivos de idioma locais e pode não finalizar
    // no ciclo de vida serverless. Em produção, páginas escaneadas seguem direto
    // para o Vision da OpenAI, que é o fallback canônico do produto.
    if (isVision && config.isProduction) {
      if (!imageDataUrl) {
        throw new Error(`VISION_EXTRACTION_UNAVAILABLE: imagem da página ${pageObj.pageNum} não foi gerada.`);
      }
      const raw = await this.generateCompletionWithFallback([
        { role: 'system', content: PROMPT_SINGLE_PASS },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analise esta página escaneada de holerite e retorne somente o JSON solicitado.' },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }
          ]
        }
      ]);
      let parsed;
      try { parsed = JSON.parse(raw); } catch { parsed = {}; }
      const competency = parsed.competency || {};
      const fields = Array.isArray(parsed.fields) ? parsed.fields : [];
      const bases = Array.isArray(parsed.bases) ? parsed.bases : [];
      return {
        page: pageObj.pageNum,
        resultKey: pageObj.resultKey || `page:${pageObj.pageNum}`,
        blockIndex: pageObj.blockIndex ?? null,
        sourceRegion: pageObj.sourceRegion ?? null,
        payrollType: pageObj.payrollType || 'normal',
        month: competency.month || parsed.month || '',
        year: competency.year || parsed.year || '',
        paymentDate: competency.paymentDate || parsed.paymentDate || null,
        company: parsed.company || null,
        employee: parsed.employee || null,
        bankInfo: parsed.bankInfo || null,
        fields,
        bases,
        totals: parsed.totals || {},
        extraction: {
          valid: fields.length > 0,
          coverage: fields.length > 0 ? 1 : 0,
          warnings: fields.length > 0 ? [] : ['A análise visual não identificou verbas nesta página.'],
          strategy: 'OPENAI_VISION_SINGLE_PASS',
          plannedPrompts: 1,
          executedPrompts: 1,
          localItems: 0,
          aiItems: fields.length + bases.length,
          deterministicItems: 0,
          aiValidatedItems: fields.length + bases.length,
          aiRecoveredItems: fields.length + bases.length,
          ocrConfidence: null,
          conflicts: [],
          sources: ['vision']
        }
      };
    }

    let sourceText = pageObj.text || '';
    let ocr = null;
    if (isVision && imageDataUrl) {
      try {
        ocr = await recognizePayrollImage(imageDataUrl);
        sourceText = ocr.text || sourceText;
      } catch (error) {
        console.warn(JSON.stringify({ event: 'local_ocr_failed', page: pageObj.pageNum, reason: error.message }));
      }
    }

    const evidenceType = isVision ? 'ocr' : 'text';
    const local = extractPayrollLocal(sourceText, { sourcePage: pageObj.pageNum, evidenceType });
    const inventory = buildPayrollInventory(sourceText, { sourcePage: pageObj.pageNum, evidenceType });
    const plan = planPayrollPromptBatches(inventory, { maxCodesPerPrompt: config.payrollBatchSize });
    const hints = catalogHintsForLabels([
      ...inventory.expectedCodes.map(item => item.label),
      ...inventory.expectedSummaryLabels
    ]);
    let executedPrompts = 0;

    const runJson = async (prompt, payload, visual = false) => {
      executedPrompts++;
      const content = visual
        ? [{ type: 'text', text: payload }, { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }]
        : payload;
      const raw = await this.generateCompletionWithFallback([{ role: 'system', content: prompt }, { role: 'user', content }]);
      try { return JSON.parse(raw); } catch { return {}; }
    };

    const identityPromise = runJson(PROMPT_IDENTITY_AGENT, `RESULTADO LOCAL:\n${JSON.stringify(inferCompetencyFromText(sourceText) || {})}\n\nTEXTO:\n${sourceText.slice(0, 5000)}`);
    const summaryPromise = runJson(PROMPT_SUMMARY_AGENT, `RESULTADO LOCAL:\n${JSON.stringify({ bases: local.bases, totals: local.totals })}\nCATEGORIAS CANDIDATAS:\n${JSON.stringify(hints)}\n\nTEXTO:\n${sourceText}`);

    const targets = plan.fieldBatches.length
      ? plan.fieldBatches.map(batch => ({ codes: batch, lines: batch.map(item => item.line).filter(Boolean) }))
      : plan.lineBatches.map(lines => ({ codes: [], lines: lines.map(item => item.line) }));
    const fieldResultsPromise = mapWithConcurrency(targets, config.openaiConcurrency, target => runJson(
      PROMPT_FIELDS_AGENT,
      `ALVO DESTE LOTE:\n${JSON.stringify(target.codes.map(({ code, label, category }) => ({ code, label, category })))}\nRESULTADO LOCAL DO LOTE:\n${JSON.stringify(local.fields.filter(item => !target.codes.length || target.codes.some(code => code.code === item.code)))}\nEVIDÊNCIA:\n${target.lines.join('\n')}`
    ));

    const [identity, summary, fieldResults] = await Promise.all([identityPromise, summaryPromise, fieldResultsPromise]);
    let ai = {
      ...identity,
      fields: fieldResults.flatMap(result => result?.fields || []),
      bases: summary?.bases || [], totals: summary?.totals || {}
    };
    let reconciled = reconcilePayrollExtractions(local, ai, { sourcePage: pageObj.pageNum, evidenceType: 'ai' });
    let audit = auditPayrollCoverage(inventory, reconciled);
    const ocrNeedsVisualReview = isVision && (!ocr || ocr.confidence < config.ocrMinimumConfidence);
    if (ocrNeedsVisualReview) {
      audit = { ...audit, valid: false, warnings: [...audit.warnings, `OCR local com confiança insuficiente (${Math.round((ocr?.confidence || 0) * 100)}%).`] };
    }
    let didRecovery = false;

    if (!audit.valid) {
      didRecovery = true;
      const missingLines = audit.missingCodes.map(item => item.line).filter(Boolean);
      const payload = `LACUNAS:\n${JSON.stringify({ missingCodes: audit.missingCodes, missingSummaryLabels: audit.missingSummaryLabels })}\nRESULTADO ATUAL:\n${JSON.stringify(reconciled)}\nEVIDÊNCIA:\n${missingLines.join('\n') || sourceText}`;
      const recovery = await runJson(PROMPT_AUDIT_AGENT, payload, isVision && Boolean(imageDataUrl));
      ai = reconcilePayrollExtractions(ai, recovery, { sourcePage: pageObj.pageNum, evidenceType: isVision ? 'vision' : 'ai_recovery' });
      reconciled = reconcilePayrollExtractions(local, ai, { sourcePage: pageObj.pageNum, evidenceType: 'ai' });
      audit = auditPayrollCoverage(inventory, reconciled);
    }

    const conflicts = reconciled.conflicts || [];
    const totalValues = Object.values(reconciled.totals || {}).filter(value => value !== null && value !== undefined && value !== '');
    const finalWarnings = [...audit.warnings];
    if (conflicts.length) finalWarnings.push(`${conflicts.length} conflito(s) entre evidências exigem revisão.`);
    if (totalValues.length === 3 && !hasConsistentPayrollTotals(reconciled.totals)) finalWarnings.push('Total de proventos menos descontos não corresponde ao valor líquido.');
    audit = { ...audit, valid: audit.valid && finalWarnings.length === 0, warnings: finalWarnings };

    const competency = identity?.competency || {};
    const inferred = inferCompetencyFromText(sourceText) || {};
    const localCount = local.fields.length + local.bases.length + Object.values(local.totals).filter(Boolean).length;
    const finalCount = (reconciled.fields || []).length + (reconciled.bases || []).length + Object.values(reconciled.totals || {}).filter(Boolean).length;
    const aiValidatedItems = (ai.fields || []).length + (ai.bases || []).length;
    return {
      page: pageObj.pageNum,
      resultKey: pageObj.resultKey || `page:${pageObj.pageNum}`,
      blockIndex: pageObj.blockIndex ?? null,
      sourceRegion: pageObj.sourceRegion ?? null,
      payrollType: pageObj.payrollType || 'normal',
      month: competency.month || inferred.month || '', year: competency.year || inferred.year || '',
      paymentDate: competency.paymentDate || null,
      company: identity.company || null, employee: identity.employee || null, bankInfo: identity.bankInfo || null,
      fields: reconciled.fields || [], bases: reconciled.bases || [], totals: reconciled.totals || {},
      extraction: {
        ...audit,
        strategy: isVision ? 'LOCAL_OCR_AGENTIC_VISION' : 'LOCAL_TEXT_AGENTIC',
        plannedPrompts: plan.plannedPrompts + (didRecovery ? 1 : 0), executedPrompts,
        localItems: localCount, aiItems: (ai.fields || []).length + (ai.bases || []).length,
        deterministicItems: localCount,
        aiValidatedItems,
        aiRecoveredItems: Math.max(0, finalCount - localCount),
        ocrConfidence: ocr?.confidence ?? null,
        conflicts, sources: [...new Set([...(reconciled.fields || []), ...(reconciled.bases || [])].map(item => item.evidenceType).filter(Boolean))]
      }
    };
  }

  async runFichaBlock(block) {
    const metadata = { sourcePage: block.pageNum, sourceRegion: block.blockIndex };
    const spatial = extractBlockDataLocal(block.items || [], metadata);
    let validation = validateFichaExtraction(block.rawText, spatial);
    let executedPrompts = 0;
    const inventory = buildPayrollInventory(block.rawText, { ...metadata, recordKey: block.recordKey });
    const promptPlan = planPayrollPromptBatches(inventory, { maxCodesPerPrompt: config.payrollBatchSize, maxChars: config.payrollPromptMaxChars });

    // A OpenAI é obrigatória na extração. A geometria local prepara a evidência
    // e funciona como contraprova; cobertura local de 100% não pode pular a IA.
    const runBatch = async ({ id, kind, items, prompt, payload }) => {
      const evidence = items.map(item => item.evidence || item.line || '').filter(Boolean).join('\n');
      const batch = {
        id,
        kind,
        reason: kind === 'ambiguous' ? 'ambiguous_evidence' : 'required_ai_extraction',
        recordKey: block.recordKey,
        region: `page:${block.pageNum}:block:${block.blockIndex}`,
        strategy: 'FICHA_ADAPTIVE_AI',
        targetCount: items.length,
        numericValueCount: (evidence.match(/-?\d+(?:[.,]\d+)?/g) || []).length,
        payloadChars: evidence.length,
        blocked: items.some(item => item.oversizedEvidence)
      };
      executedPrompts++;
      const raw = await this.executePayrollPrompt([
        { role: 'system', content: prompt },
        { role: 'user', content: payload(evidence) }
      ], batch);
      try { return JSON.parse(raw); } catch { return {}; }
    };

    const context = `COMPETÊNCIA: ${block.month}/${block.year}\nTIPO: ${block.payrollType}`;
    const tasks = [
      ...promptPlan.fieldBatches.map((items, index) => () => runBatch({
        id: `${block.recordKey}:fields:${index}`,
        kind: 'fields',
        items,
        prompt: PROMPT_FIELDS_AGENT,
        payload: evidence => `${context}\nALVOS: ${JSON.stringify(items.map(({ code, label, category }) => ({ code, label, category })))}\nRESULTADO ESPACIAL (somente apoio): ${JSON.stringify(spatial.fields.filter(field => items.some(item => item.code === field.code)))}\nEVIDÊNCIA:\n${evidence}`
      })),
      ...promptPlan.lineBatches.map((items, index) => () => runBatch({
        id: `${block.recordKey}:ambiguous:${index}`,
        kind: 'ambiguous',
        items,
        prompt: PROMPT_FICHA_FINANCEIRA_BLOCK,
        payload: evidence => `${context}\nResolva somente os itens visíveis nestas linhas ambíguas. Não invente.\nEVIDÊNCIA:\n${evidence}`
      }))
    ];

    const summarySourceBatches = promptPlan.summaryBatches.length
      ? promptPlan.summaryBatches
      : createAdaptiveBatches(
          String(block.rawText || '').split('\n').filter(Boolean).map((line, index) => ({ index, line, evidence: line })),
          { maxTargets: config.payrollBatchSize, maxChars: config.payrollPromptMaxChars, prefix: `${block.recordKey}:summary-source`, kind: 'summaries' }
        ).map(batch => batch.items);
    tasks.push(...summarySourceBatches.map((items, index) => () => runBatch({
      id: `${block.recordKey}:summaries:${index}`,
      kind: 'summaries',
      items,
      prompt: PROMPT_SUMMARY_AGENT,
      payload: evidence => `${context}\nRESULTADO ESPACIAL (somente apoio): ${JSON.stringify({ bases: spatial.bases, totals: spatial.totals })}\nEVIDÊNCIA:\n${evidence}`
    })));

    // Um bloco vazio ainda passa pela IA e falha de forma observável caso não
    // exista evidência suficiente, em vez de ser aceito silenciosamente.
    if (!tasks.length) {
      const fallbackItems = [{ evidence: String(block.rawText || 'Bloco sem texto extraível') }];
      tasks.push(() => runBatch({
        id: `${block.recordKey}:fallback:0`,
        kind: 'ambiguous',
        items: fallbackItems,
        prompt: PROMPT_FICHA_FINANCEIRA_BLOCK,
        payload: evidence => `${context}\nEVIDÊNCIA:\n${evidence}`
      }));
    }

    const aiParts = await mapWithConcurrency(tasks, config.openaiConcurrency, task => task());
    let ai = { fields: [], bases: [], totals: {} };
    for (const part of aiParts) {
      ai = reconcilePayrollExtractions(ai, part || {}, { ...metadata, evidenceType: 'ai' });
    }
    let reconciled = reconcilePayrollExtractions(ai, spatial, { ...metadata, evidenceType: 'ai' });
    const aiTotals = Object.fromEntries(Object.entries(ai.totals || {}).filter(([, value]) => value !== null && value !== undefined && value !== ''));
    reconciled.totals = { ...(spatial.totals || {}), ...aiTotals };
    validation = validateFichaExtraction(block.rawText, reconciled);

    const warnings = [...validation.warnings];
    const deterministicItems = spatial.fields.length + spatial.bases.length + Object.values(spatial.totals).filter(value => value !== null && value !== undefined && value !== '').length;
    const finalItems = (reconciled.fields?.length || 0) + (reconciled.bases?.length || 0) + Object.values(reconciled.totals || {}).filter(value => value !== null && value !== undefined && value !== '').length;
    const visibleItems = Math.max(validation.expectedCount || 0, deterministicItems);
    const aiRecoveredItems = Math.max(0, finalItems - deterministicItems);
    const aiValidatedItems = [...(reconciled.fields || []), ...(reconciled.bases || [])]
      .filter(item => String(item.evidenceType || '').startsWith('ai')).length;
    const pendingItems = Math.max(0, visibleItems - Math.min(visibleItems, finalItems));
    const totalValues = Object.values(reconciled.totals || {}).filter(value => value !== null && value !== undefined && value !== '');
    if (totalValues.length === 3 && !hasConsistentPayrollTotals(reconciled.totals)) {
      warnings.push('Total de proventos menos descontos não corresponde ao valor líquido.');
    }

    return {
      page: block.pageNum,
      blockIndex: block.blockIndex,
      recordKey: block.recordKey,
      resultKey: block.recordKey,
      sourcePages: block.continuesOnPages || [block.pageNum],
      month: block.month,
      year: block.year,
      payrollType: block.payrollType,
      fields: reconciled.fields || [],
      bases: reconciled.bases || [],
      totals: reconciled.totals || {},
      reviewRequired: warnings.length > 0 || (reconciled.conflicts || []).length > 0,
      extraction: {
        ...validation,
        valid: validation.valid && warnings.length === 0,
        warnings,
        strategy: 'FICHA_ADAPTIVE_AI',
        visibleItems,
        deterministicItems,
        aiRecoveredItems,
        aiValidatedItems,
        pendingItems,
        coverage: visibleItems ? (visibleItems - pendingItems) / visibleItems : 1,
        plannedBatches: tasks.length,
        plannedPrompts: tasks.length,
        executedPrompts,
        localItems: deterministicItems,
        aiItems: aiRecoveredItems,
        conflicts: reconciled.conflicts || [],
        sources: [...new Set([...(reconciled.fields || []), ...(reconciled.bases || [])].map(item => item.evidenceType).filter(Boolean))]
      }
    };
  }

  async parsePayrollMock(filePath, options = {}) {
    const onProgress = options.onProgress || (() => {});
    const onPageCompleted = options.onPageCompleted || (() => {});
    const document = await new Promise((resolve, reject) => {
      pdfExtract.extract(filePath, {}, (error, result) => error ? reject(error) : resolve(result));
    });
    const isFicha = detectFichaFinanceira(document.pages);
    const rawPages = isFicha
      ? segmentAllMonthBlocks(document.pages).map(block => ({
          page: block.pageNum,
          blockIndex: block.blockIndex,
          recordKey: block.recordKey,
          resultKey: block.recordKey,
          month: block.month,
          year: block.year,
          payrollType: block.payrollType,
          ...extractBlockDataLocal(block.items, { sourcePage: block.pageNum, sourceRegion: block.blockIndex })
        }))
      : (await this.extractPdfTextPages(filePath)).map(page => ({
          page: page.pageNum,
          resultKey: `page:${page.pageNum}`,
          payrollType: classifyStandardPayrollType(page.text),
          ...extractPayrollLocal(page.text, { sourcePage: page.pageNum, evidenceType: 'text' })
        }));

    onProgress({ current: 0, total: rawPages.length, percentage: 10, message: 'Executando extração determinística de smoke test.' });
    for (let index = 0; index < rawPages.length; index++) {
      await onPageCompleted(rawPages[index]);
      onProgress({ current: index + 1, total: rawPages.length, percentage: Math.min(95, Math.round(10 + ((index + 1) / rawPages.length) * 85)), message: `Registro ${index + 1} de ${rawPages.length} concluído.` });
    }
    return normalizePayrollResponse({ pages: [...(options.completedResults || []), ...rawPages] });
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

      if (options.useMock) {
        if (config.isProduction) throw new Error('OPENAI_MOCK_FORBIDDEN_IN_PRODUCTION: o modo mock é exclusivo de validações locais.');
        return this.parsePayrollMock(filePath, options);
      }

      if (!this.isReady()) {
        throw new Error('OPENAI_NOT_CONFIGURED: configure OPENAI_API_KEY ou OPENAI_SECRET_KEY para transcrever documentos.');
      }

      onProgress({ current: 0, total: 0, percentage: 5, message: 'Lendo arquivo PDF e analisando layout...', log: 'Arquivo PDF carregado no servidor. Analisando estrutura...' });

      try {
          // Extrai o PDF bruto via pdfExtract para verificar se Ã© Ficha Financeira
          const verifiedCompletedResults = selectVerifiedAiCheckpoints(options.completedResults || []);
          const verifiedCompletedResultKeys = new Set(verifiedCompletedResults.map(result => result.resultKey).filter(Boolean));
          const pdfRawData = await new Promise((resolve, reject) => {
            pdfExtract.extract(filePath, {}, (err, res) => {
              if (err) return reject(err);
              resolve(res);
            });
          });

          const isFicha = detectFichaFinanceira(pdfRawData.pages);

          if (isFicha) {
            const blocks = segmentAllMonthBlocks(pdfRawData.pages)
              .map(block => ({ ...block, resultKey: `page:${block.pageNum}:block:${block.blockIndex}` }))
              .filter(block => !verifiedCompletedResultKeys.has(block.resultKey));
            console.log(`ðŸ“„ Documento identificado como Ficha Financeira: ${blocks.length} blocos mensais detectados.`);
            onProgress({
              current: 0,
              total: blocks.length,
              percentage: 10,
              message: `Ficha Financeira detectada (${blocks.length} blocos mensais)`,
              log: `Ficha Financeira identificada: ${blocks.length} bloco(s) mensais para extracao.`
            });

            let completedBlocks = 0;
            const blockTasks = blocks.map((block, bIdx) => async () => {
              try {
                console.log(`ðŸ” [OpenAI] Extraindo bloco ${bIdx + 1}/${blocks.length}: CompetÃªncia ${block.month}/${block.year} (PÃ¡g ${block.pageNum})...`);

                const hybrid = await this.runFichaBlock(block);
                const hybridBlockResult = { ...hybrid, extractionValidation: hybrid.extraction };
                await onPageCompleted(hybridBlockResult);
                completedBlocks++;
                const hybridPct = Math.min(95, Math.round(10 + (completedBlocks / blocks.length) * 85));
                onProgress({ current: completedBlocks, total: blocks.length, percentage: hybridPct, message: `Bloco ${completedBlocks} de ${blocks.length} concluído (${block.month}/${block.year})`, log: `Pipeline híbrido: ${hybridBlockResult.fields.length} verbas e ${hybridBlockResult.bases.length} bases.` });
                return hybridBlockResult;

                /* istanbul ignore next -- caminho legado preservado para rollback */
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

            const blockOutcomes = await mapWithConcurrency(blockTasks, config.openaiPageConcurrency, task => task());
            const extractedBlocksRaw = blockOutcomes.filter(Boolean);
            if (blockOutcomes.some(result => !result)) throw new Error('OPENAI_EXTRACTION_PARTIAL: um ou mais blocos falharam; retomando somente os pendentes.');
            const allBlocksRaw = [...verifiedCompletedResults, ...extractedBlocksRaw];
            assertVerifiedAiExecution(allBlocksRaw);
            const parsedObj = { pages: allBlocksRaw };
            const normalized = normalizePayrollResponse(parsedObj);
            const validationWarnings = allBlocksRaw.flatMap(block => (block.extractionValidation?.valid ? [] : block.extractionValidation?.warnings || []).map(message => `${block.resultKey}: ${message}`));
            if (validationWarnings.length) normalized.audit = { ...(normalized.audit || {}), status: 'review_required', warnings: [...(normalized.audit?.warnings || []), ...validationWarnings] };

            if (normalized.pages?.length > 0) {
              return normalized;
            }
          }

          // Caso padrÃ£o (Holerite comum por pÃ¡gina)
          const sourcePages = await this.extractPdfTextPages(filePath);
          const pdfPages = buildStandardProcessingUnits(sourcePages)
            .filter(page => !verifiedCompletedResultKeys.has(page.resultKey) && !verifiedCompletedResultKeys.has(`page:${page.pageNum}`));
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
          console.log(`Processando ${totalPages} páginas de holerite via OpenAI...`);
          onProgress({
            current: 0,
            total: totalPages,
            percentage: 10,
            message: `PDF possui ${totalPages} página(s). Extraindo dados via OpenAI...`,
            log: `PDF possui ${totalPages} página(s). Iniciando análise com IA...`
          });

          let completedPages = 0;
          const processPage = async (pageObj) => {
            try {
              const density = pageObj.density || analyzePageDensity(pageObj.rawContent);
              const strategy = selectExtractionStrategy(density, false);
              const isVision = strategy === 'VISION_SINGLE_PASS';
              const hybridResult = await this.runHybridPageAgents(pageObj, {
                isVision,
                imageDataUrl: scannedImages.get(pageObj.pageNum)?.dataUrl
              });
              await onPageCompleted(hybridResult);
              completedPages++;
              const hybridPct = Math.min(95, Math.round(10 + (completedPages / totalPages) * 85));
              onProgress({
                current: completedPages,
                total: totalPages,
                percentage: hybridPct,
                message: `Página ${completedPages} de ${totalPages} concluída`,
                log: `Pipeline híbrido - Página ${pageObj.pageNum}: ${hybridResult.fields.length} verbas; cobertura ${(hybridResult.extraction.coverage * 100).toFixed(0)}%.`
              });
              return hybridResult;

              /* istanbul ignore next -- pipeline legado mantido temporariamente como referência de rollback */
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
          };

          // Cada página já dispara múltiplos agentes. Limitar páginas simultâneas
          // evita uma rajada de requisições em PDFs escaneados.
          const pageOutcomes = await mapWithConcurrency(
            pdfPages,
            config.openaiPageConcurrency,
            processPage
          );
          const extractedPagesRaw = pageOutcomes.filter(Boolean);
          if (pageOutcomes.some(result => !result)) throw new Error('OPENAI_EXTRACTION_PARTIAL: uma ou mais páginas falharam; retomando somente as pendentes.');
          if (scannedPageNumbers.length && extractedPagesRaw.length === 0) {
            throw new Error('VISION_EXTRACTION_UNAVAILABLE: nenhuma pagina escaneada foi extraida pela API.');
          }
          const allPagesRaw = [...verifiedCompletedResults, ...extractedPagesRaw];
          assertVerifiedAiExecution(allPagesRaw);
          const parsedObj = { pages: allPagesRaw };
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
