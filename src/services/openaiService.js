import OpenAI from 'openai';
import fs from 'fs';
import { config } from '../config/env.js';
import { normalizePayrollResponse } from '../normalizers/payrollNormalizer.js';
import { normalizeTimeCardResponse } from '../normalizers/timeCardNormalizer.js';
import { getMockData } from '../mocks/mockProvider.js';
import { extractPayrollLocalPdf, rasterizePdfPages } from '../utils/pdfExtractor.js';
import { detectFichaFinanceira, segmentAllMonthBlocks } from '../utils/fichaFinanceiraSegmenter.js';
import { analyzePageDensity, selectExtractionStrategy } from '../utils/densityAnalyzer.js';
import { PDFExtract } from 'pdf.js-extract';

const pdfExtract = new PDFExtract();

/**
 * PROMPT UNIFICADO: Extrai identificação + competência + verbas em uma única chamada.
 * Isso garante que a data (mês/ano) sempre viaje junto das verbas, evitando o bug
 * onde a competência desaparece ao mesclar múltiplas páginas.
 */
const PROMPT_UNIFIED = `Você é um especialista em OCR e estruturação de Folhas de Pagamento (Holerites) brasileiros.
Analise o texto desta página de holerite e extraia:
1. A COMPETÊNCIA (mês e ano de referência do holerite) — OBRIGATÓRIO. Procure por textos como "Competência:", "Mês/Ano:", "Período:", "Referência:", ou padrões como "05/2024".
2. Os dados do FUNCIONÁRIO e EMPRESA (cabeçalho).
3. TODAS as VERBAS da tabela principal (Proventos e Descontos), SEM OMITIR NENHUMA.

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
  "competency": {
    "month": "MM",
    "year": "YYYY",
    "paymentDate": "DD/MM/YYYY ou null"
  },
  "company": {
    "name": "Nome da Empresa",
    "cnpj": "CNPJ ou null",
    "branch": "Filial ou null"
  },
  "employee": {
    "name": "Nome do Funcionário",
    "cpf": "CPF ou null",
    "registration": "Matrícula ou null",
    "role": "Cargo ou null",
    "department": "Departamento ou null",
    "admissionDate": "DD/MM/YYYY ou null"
  },
  "bankInfo": {
    "bank": "Banco ou null",
    "agency": "Agência ou null",
    "account": "Conta ou null"
  },
  "fields": [
    {
      "code": "Código numérico ou null",
      "label": "Descrição exata da verba como aparece no documento",
      "reference": "Qtd/Horas/Percentual ou null",
      "value": "Valor monetário R$ (ex: 3.200,00)",
      "type": "provento ou desconto"
    }
  ]
}`;

/**
 * PROMPT DE TOTAIS: Extrai exclusivamente rodapé (totais, bases, encargos).
 * Explicitamente instruído a NÃO repetir itens que já são verbas individuais.
 */
const PROMPT_TOTALS = `Você é um especialista em OCR e estruturação de Folhas de Pagamento (Holerites) brasileiros.
Analise o texto desta página e extraia APENAS os dados do RODAPÉ da folha:
1. Os totais consolidados (Total Proventos, Total Descontos, Valor Líquido)
2. As bases de cálculo (Base INSS, Base IRRF, Base FGTS, FGTS do Mês etc.)

REGRAS CRÍTICAS:
- NÃO inclua verbas individuais (ex: Salário Base, Vale Transporte, Horas Extras) — apenas totais e bases.
- Se um item é uma verba individual da tabela principal, IGNORE-O aqui.
- "bases" deve conter APENAS linhas de rodapé como: Base INSS, Base IRRF, Base FGTS, FGTS do Mês, Alíquota IRRF.
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

ESTRUTURA JSON ESPERADA:
{
  "fields": [
    {
      "code": "código da verba (ex: 001, 091, 511)",
      "label": "descrição da verba (ex: Salário Base, Hr Adic Pericul, INSS Normal)",
      "reference": "referência ou horas/dias/percentual (ex: 220,00, 146,67, 11%)",
      "value": "valor monetário (ex: 1.620,65)",
      "type": "provento" ou "desconto"
    }
  ],
  "bases": [
    {
      "label": "nome da base ou valor de referência (ex: Base INSS, Base IRRF, Base FGTS, FGTS do Mês)",
      "value": "valor monetário (ex: 1.260,65)"
    }
  ],
  "totals": {
    "totalAdditions": "Total Proventos / Rendimentos",
    "totalDeductions": "Total Descontos",
    "netValue": "Valor Líquido no Mês"
  }
}

REGRAS:
- Proventos (créditos) devem ter "type": "provento".
- Descontos (débitos) devem ter "type": "desconto".
- NÃO omita nenhuma verba do bloco.
- NÃO invente dados.
`;

/**
 * PROMPT DE PASSAGEM ÚNICA (SINGLE-PASS):
 * Extrai identificação + competência + verbas + totais + bases em 1 única chamada API.
 * Usado para economizar 50% de tokens em documentos de densidade baixa/média.
 */
const PROMPT_SINGLE_PASS = `Você é um especialista em OCR e estruturação de Folhas de Pagamento (Holerites) brasileiros.
Analise o texto desta página de holerite e extraia TODOS os dados estruturados:

1. COMPETÊNCIA (mês e ano de referência) — OBRIGATÓRIO.
2. DADOS DO FUNCIONÁRIO, EMPRESA E DADOS BANCÁRIOS.
3. TODAS AS VERBAS da tabela principal (Proventos e Descontos), SEM OMITIR NENHUMA.
4. TOTAIS DO RODAPÉ (Total Proventos, Total Descontos, Valor Líquido).
5. BASES DE CÁLCULO (Base INSS, Base IRRF, Base FGTS, FGTS do Mês, etc.).

REGRAS CRÍTICAS:
- "competency.month" DEVE conter o mês (01-12) e "competency.year" o ano com 4 dígitos (ex: 2024).
- Para cada verba em "fields": "reference" = quantidade/horas/percentual; "value" = valor monetário R$.
- "type" de cada verba deve ser "provento" ou "desconto".
- NÃO inclua totais ou bases dentro do array "fields".
- Se um campo não existir, use null ou string vazia — NUNCA invente dados.

Formato JSON estrito:
{
  "competency": {
    "month": "MM",
    "year": "YYYY",
    "paymentDate": "DD/MM/YYYY ou null"
  },
  "company": {
    "name": "Nome da Empresa",
    "cnpj": "CNPJ ou null",
    "branch": "Filial ou null"
  },
  "employee": {
    "name": "Nome do Funcionário",
    "cpf": "CPF ou null",
    "registration": "Matrícula ou null",
    "role": "Cargo ou null",
    "department": "Departamento ou null",
    "admissionDate": "DD/MM/YYYY ou null"
  },
  "bankInfo": {
    "bank": "Banco ou null",
    "agency": "Agência ou null",
    "account": "Conta ou null"
  },
  "fields": [
    {
      "code": "Código numérico ou null",
      "label": "Descrição exata da verba",
      "reference": "Qtd/Horas/Percentual ou null",
      "value": "Valor monetário R$",
      "type": "provento ou desconto"
    }
  ],
  "totals": {
    "totalAdditions": "Total Proventos R$ ou null",
    "totalDeductions": "Total Descontos R$ ou null",
    "netValue": "Valor Líquido R$ ou null"
  },
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
export class OpenAIService {
  constructor(apiKey = config.openaiApiKey) {
    this.apiKey = apiKey;
    this.client = null;
    this.initClient();
  }

  initClient() {
    const key = this.apiKey || process.env.OPENAI_SECRET_KEY || process.env.OPENAI_API_KEY;
    if (!key) {
      console.warn('⚠️ Alerta: OPENAI_SECRET_KEY não configurada.');
      return;
    }

    try {
      this.client = new OpenAI({ apiKey: key });
    } catch (error) {
      console.error('❌ Erro ao inicializar o cliente OpenAI:', error.message);
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
   * Executa chamada com fallback de modelos (gpt-5.6-luna -> gpt-4o -> gpt-4o-mini)
   */
  async generateCompletionWithFallback(messages, options = {}) {
    const models = ['gpt-5.6-luna', 'gpt-4o', 'gpt-4o-mini'];
    let lastError;

    for (const model of models) {
      try {
        console.log(`🤖 Executando requisição OpenAI com modelo: ${model}`);
        const requestParams = {
          model,
          messages,
          response_format: { type: 'json_object' },
          ...options
        };

        if (!model.includes('gpt-5') && !model.includes('luna') && !model.includes('nano') && !model.startsWith('o')) {
          requestParams.temperature = 0.1;
        }

        const response = await this.client.chat.completions.create(requestParams);
        return response.choices[0]?.message?.content || '{}';
      } catch (err) {
        console.warn(`⚠️ Modelo OpenAI ${model} falhou ou sofreu limitação (${err.message}). Tentando modelo seguinte...`);
        lastError = err;
      }
    }
    throw lastError;
  }

  /**
   * Extrai o conteúdo preservando colunas espaciais separado por páginas
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
   * Processa página por página para garantir 100% de cobertura sem omissão de verbas.
   */
  async parsePayroll(filePath, options = {}) {
    const onProgress = options.onProgress || (() => {});
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }

      onProgress({ current: 0, total: 0, percentage: 5, message: 'Lendo arquivo PDF e analisando layout...', log: 'Arquivo PDF carregado no servidor. Analisando estrutura...' });

      if (this.isReady() && !options.useMock) {
        try {
          // Extrai o PDF bruto via pdfExtract para verificar se é Ficha Financeira
          const pdfRawData = await new Promise((resolve, reject) => {
            pdfExtract.extract(filePath, {}, (err, res) => {
              if (err) return reject(err);
              resolve(res);
            });
          });

          const isFicha = detectFichaFinanceira(pdfRawData.pages);

          if (isFicha) {
            const blocks = segmentAllMonthBlocks(pdfRawData.pages);
            console.log(`📄 Documento identificado como Ficha Financeira: ${blocks.length} blocos mensais detectados.`);
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
                console.log(`🔍 [OpenAI] Extraindo bloco ${bIdx + 1}/${blocks.length}: Competência ${block.month}/${block.year} (Pág ${block.pageNum})...`);

                const completionJson = await this.generateCompletionWithFallback([
                  { role: 'system', content: PROMPT_FICHA_FINANCEIRA_BLOCK },
                  {
                    role: 'user',
                    content: `COMPETÊNCIA DO BLOCO: ${block.month}/${block.year}\n\nTEXTO DO BLOCO:\n${block.rawText}`
                  }
                ]);

                let parsed = {};
                try {
                  parsed = JSON.parse(completionJson);
                } catch {
                  parsed = {};
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
                  month: block.month,
                  year: block.year,
                  fields,
                  totals: parsed.totals || {},
                  bases: parsed.bases || []
                };

                completedBlocks++;
                const pct = Math.min(95, Math.round(10 + (completedBlocks / blocks.length) * 85));
                  log: `Bloco ${block.month}/${block.year}: ${fields.length} verbas e ${result.bases.length} bases extraidas.`
                onProgress({
                  current: completedBlocks,
                  total: blocks.length,
                  percentage: pct,
                  message: `Bloco ${completedBlocks} de ${blocks.length} concluído (${block.month}/${block.year})`,
                  log: `Bloco ${block.month}/${block.year}: ${fields.length} verbas e ${result.bases.length} bases extraidas.`
                });

                return result;
              } catch (err) {
                console.warn(`⚠️ Falha na extração do bloco ${block.month}/${block.year} via OpenAI:`, err.message);
                completedBlocks++;
                onProgress({
                  current: completedBlocks,
                  total: blocks.length,
                  message: `Falha na extração do bloco ${block.month}/${block.year}`,
                  log: `Erro no bloco ${block.month}/${block.year}: ${err.message}`
                });
                return null;
              }
            });

            const extractedBlocksRaw = (await Promise.all(blockPromises)).filter(Boolean);
            const parsedObj = { pages: extractedBlocksRaw };
            const normalized = normalizePayrollResponse(parsedObj);

            if (normalized.pages?.length > 0) {
              return normalized;
            }
          }

          // Caso padrão (Holerite comum por página)
          const pdfPages = await this.extractPdfTextPages(filePath);
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
            scannedImages = await rasterizePdfPages(filePath, scannedPageNumbers, { scale: 4 });
          }
          console.log(`📄 Processando ${totalPages} páginas de holerite em paralelo via OpenAI...`);
          onProgress({
            current: 0,
            total: totalPages,
            percentage: 10,
            message: `PDF possui ${totalPages} página(s). Extraindo dados via OpenAI...`,
            log: `PDF possui ${totalPages} pagina(s). Iniciando analise com IA...`
          });

          let completedPages = 0;
          const pagePromises = pdfPages.map(async (pageObj) => {
            try {
              const density = pageObj.density || analyzePageDensity(pageObj.rawContent);
              const strategy = selectExtractionStrategy(density, false);
              const isVision = strategy === 'VISION_SINGLE_PASS';
              const inputContent = isVision
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
              const month = competency.month || unifiedData.month || '';
              const year = competency.year || unifiedData.year || '';
              const paymentDate = competency.paymentDate || unifiedData.paymentDate || null;

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

              completedPages++;
              const pct = Math.min(95, Math.round(10 + (completedPages / totalPages) * 85));
              console.log(`✅ Página ${pageObj.pageNum}: Competência ${month}/${year} | Verbas: ${fields.length} | Bases: ${result.bases.length}`);
              onProgress({
                current: completedPages,
                total: totalPages,
                percentage: pct,
                message: `Página ${completedPages} de ${totalPages} concluída`,
                log: `${isVision ? 'Visao IA' : 'IA'} - Pagina ${pageObj.pageNum}: ${fields.length} verbas extraidas via modelo.`
              });

              return result;
            } catch (err) {
              console.warn(`⚠️ Falha na extração da página ${pageObj.pageNum} via OpenAI:`, err.message);
              completedPages++;
              onProgress({
                current: completedPages,
                total: totalPages,
                message: `Falha na extração da página ${pageObj.pageNum}`,
                log: `Erro na pagina ${pageObj.pageNum}: ${err.message}`
              });
              return null;
            }
          });

          const extractedPagesRaw = (await Promise.all(pagePromises)).filter(Boolean);
          if (scannedPageNumbers.length && extractedPagesRaw.length === 0) {
            throw new Error('VISION_EXTRACTION_UNAVAILABLE: nenhuma pagina escaneada foi extraida pela API.');
          }
          const parsedObj = { pages: extractedPagesRaw };
          const normalized = normalizePayrollResponse(parsedObj);

          if (normalized.pages?.[0]?.fields?.length) {
            return normalized;
          }
        } catch (apiErr) {
          if (apiErr.message?.startsWith('VISION_EXTRACTION_UNAVAILABLE:')) throw apiErr;
          console.warn(`⚠️ API da OpenAI falhou (${apiErr.message}). Utilizando extrator local em PDF...`);
          onProgress({ current: 0, total: 0, percentage: 10, message: 'Utilizando extrator local de PDF...', log: `OpenAI indisponivel (${apiErr.message}). Recorrendo ao extrator local.` });
        }
      }

      // Fallback para o extrator local
      const localResult = await extractPayrollLocalPdf(filePath, options);
      return normalizePayrollResponse(localResult);

    } catch (error) {
      console.error(`❌ Erro no parsing via OpenAI (${filePath}):`, error.message);
      return normalizePayrollResponse({ pages: [] });
    }
  }

  /**
   * Envia o PDF de Cartão de Ponto para a API da OpenAI e retorna o DTO normalizado.
   */
  async parseTimeCard(filePath, options = {}) {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo não encontrado: ${filePath}`);
      }
      const mockRaw = getMockData(filePath, 'time_card');
      return normalizeTimeCardResponse(mockRaw);
    } catch (error) {
      console.error(`❌ Erro no parsing de Cartão de Ponto via OpenAI (${filePath}):`, error.message);
      const fallbackRaw = getMockData(filePath, 'time_card');
      return normalizeTimeCardResponse(fallbackRaw);
    }
  }

  async parseDocument(filePath, documentType, options = {}) {
    if (documentType === 'time_card') {
      return this.parseTimeCard(filePath, options);
    } else if (documentType === 'payroll') {
      return this.parsePayroll(filePath, options);
    } else {
      throw new Error(`Tipo de documento não suportado: ${documentType}`);
    }
  }
}

export const openaiService = new OpenAIService();
