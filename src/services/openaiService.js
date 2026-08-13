import OpenAI from 'openai';
import fs from 'fs';
import { config } from '../config/env.js';
import { normalizePayrollResponse } from '../normalizers/payrollNormalizer.js';
import { normalizeTimeCardResponse, auditTimeCardPage } from '../normalizers/timeCardNormalizer.js';
import { getMockData } from '../mocks/mockProvider.js';
import { extractPayrollLocalPdf, rasterizePdfPages } from '../utils/pdfExtractor.js';
import { detectFichaFinanceira, segmentAllMonthBlocks } from '../utils/fichaFinanceiraSegmenter.js';
import { analyzePageDensity, selectExtractionStrategy, selectTimeCardExtractionStrategy } from '../utils/densityAnalyzer.js';
import { PDFExtract } from 'pdf.js-extract';

const pdfExtract = new PDFExtract();

/**
 * PROMPT UNIFICADO: Extrai identificaÃ§Ã£o + competÃªncia + verbas em uma Ãºnica chamada.
 * Isso garante que a data (mÃªs/ano) sempre viaje junto das verbas, evitando o bug
 * onde a competÃªncia desaparece ao mesclar mÃºltiplas pÃ¡ginas.
 */
const PROMPT_UNIFIED = `VocÃª Ã© um especialista em OCR e estruturaÃ§Ã£o de Folhas de Pagamento (Holerites) brasileiros.
Analise o texto desta pÃ¡gina de holerite e extraia:
1. A COMPETÃŠNCIA (mÃªs e ano de referÃªncia do holerite) â€” OBRIGATÃ“RIO. Procure por textos como "CompetÃªncia:", "MÃªs/Ano:", "PerÃ­odo:", "ReferÃªncia:", ou padrÃµes como "05/2024".
2. Os dados do FUNCIONÃRIO e EMPRESA (cabeÃ§alho).
3. TODAS as VERBAS da tabela principal (Proventos e Descontos), SEM OMITIR NENHUMA.

REGRAS CRÃTICAS:
- "competency.month" DEVE conter o nÃºmero do mÃªs (01-12) da folha de pagamento.
- "competency.year" DEVE conter o ano com 4 dÃ­gitos (ex: 2024).
- NÃƒO confunda data de admissÃ£o, emissÃ£o, nascimento ou pagamento com a competÃªncia.
- Para cada verba em "fields": "reference" = quantidade/horas/percentual; "value" = valor monetÃ¡rio R$.
- "type" de cada verba deve ser "provento" se Ã© crÃ©dito/adiÃ§Ã£o, ou "desconto" se Ã© dÃ©bito/subtraÃ§Ã£o.
- NÃƒO inclua totais (Total Proventos, Total Descontos, Valor LÃ­quido) em "fields".
- Se algum campo nÃ£o existir no documento, use null ou string vazia â€” NUNCA invente dados.

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
    "name": "Nome do FuncionÃ¡rio",
    "cpf": "CPF ou null",
    "registration": "MatrÃ­cula ou null",
    "role": "Cargo ou null",
    "department": "Departamento ou null",
    "admissionDate": "DD/MM/YYYY ou null"
  },
  "bankInfo": {
    "bank": "Banco ou null",
    "agency": "AgÃªncia ou null",
    "account": "Conta ou null"
  },
  "fields": [
    {
      "code": "CÃ³digo numÃ©rico ou null",
      "label": "DescriÃ§Ã£o exata da verba como aparece no documento",
      "reference": "Qtd/Horas/Percentual ou null",
      "value": "Valor monetÃ¡rio R$ (ex: 3.200,00)",
      "type": "provento ou desconto"
    }
  ]
}`;

/**
 * PROMPT DE TOTAIS: Extrai exclusivamente rodapÃ© (totais, bases, encargos).
 * Explicitamente instruÃ­do a NÃƒO repetir itens que jÃ¡ sÃ£o verbas individuais.
 */
const PROMPT_TOTALS = `VocÃª Ã© um especialista em OCR e estruturaÃ§Ã£o de Folhas de Pagamento (Holerites) brasileiros.
Analise o texto desta pÃ¡gina e extraia APENAS os dados do RODAPÃ‰ da folha:
1. Os totais consolidados (Total Proventos, Total Descontos, Valor LÃ­quido)
2. As bases de cÃ¡lculo (Base INSS, Base IRRF, Base FGTS, FGTS do MÃªs etc.)

REGRAS CRÃTICAS:
- NÃƒO inclua verbas individuais (ex: SalÃ¡rio Base, Vale Transporte, Horas Extras) â€” apenas totais e bases.
- Se um item Ã© uma verba individual da tabela principal, IGNORE-O aqui.
- "bases" deve conter APENAS linhas de rodapÃ© como: Base INSS, Base IRRF, Base FGTS, FGTS do MÃªs, AlÃ­quota IRRF.
- Se um campo nÃ£o existir no documento, use null â€” NUNCA invente valores.

Formato JSON estrito:
{
  "totals": {
    "totalAdditions": "Total de Proventos R$ ou null",
    "totalDeductions": "Total de Descontos R$ ou null",
    "netValue": "Valor LÃ­quido R$ ou null"
  },
  "bases": [
    { "label": "Nome exato da base (ex: Base INSS)", "value": "Valor R$" }
  ]
}`;

const PROMPT_FICHA_FINANCEIRA_BLOCK = `VocÃª Ã© um especialista em OCR e estruturaÃ§Ã£o de Fichas Financeiras e Holerites brasileiros.
Analise o texto deste bloco mensal da Ficha Financeira e extraia TODAS as verbas (Proventos e Descontos), Totais e Bases de CÃ¡lculo.

ESTRUTURA JSON ESPERADA:
{
  "fields": [
    {
      "code": "cÃ³digo da verba (ex: 001, 091, 511)",
      "label": "descriÃ§Ã£o da verba (ex: SalÃ¡rio Base, Hr Adic Pericul, INSS Normal)",
      "reference": "referÃªncia ou horas/dias/percentual (ex: 220,00, 146,67, 11%)",
      "value": "valor monetÃ¡rio (ex: 1.620,65)",
      "type": "provento" ou "desconto"
    }
  ],
  "bases": [
    {
      "label": "nome da base ou valor de referÃªncia (ex: Base INSS, Base IRRF, Base FGTS, FGTS do MÃªs)",
      "value": "valor monetÃ¡rio (ex: 1.260,65)"
    }
  ],
  "totals": {
    "totalAdditions": "Total Proventos / Rendimentos",
    "totalDeductions": "Total Descontos",
    "netValue": "Valor LÃ­quido no MÃªs"
  }
}

REGRAS:
- Proventos (crÃ©ditos) devem ter "type": "provento".
- Descontos (dÃ©bitos) devem ter "type": "desconto".
- NÃƒO omita nenhuma verba do bloco.
- NÃƒO invente dados.
`;

/**
 * PROMPT DE PASSAGEM ÃšNICA (SINGLE-PASS):
 * Extrai identificaÃ§Ã£o + competÃªncia + verbas + totais + bases em 1 Ãºnica chamada API.
 * Usado para economizar 50% de tokens em documentos de densidade baixa/mÃ©dia.
 */
const PROMPT_SINGLE_PASS = `VocÃª Ã© um especialista em OCR e estruturaÃ§Ã£o de Folhas de Pagamento (Holerites) brasileiros.
Analise o texto desta pÃ¡gina de holerite e extraia TODOS os dados estruturados:

1. COMPETÃŠNCIA (mÃªs e ano de referÃªncia) â€” OBRIGATÃ“RIO.
2. DADOS DO FUNCIONÃRIO, EMPRESA E DADOS BANCÃRIOS.
3. TODAS AS VERBAS da tabela principal (Proventos e Descontos), SEM OMITIR NENHUMA.
4. TOTAIS DO RODAPÃ‰ (Total Proventos, Total Descontos, Valor LÃ­quido).
5. BASES DE CÃLCULO (Base INSS, Base IRRF, Base FGTS, FGTS do MÃªs, etc.).

REGRAS CRÃTICAS:
- "competency.month" DEVE conter o mÃªs (01-12) e "competency.year" o ano com 4 dÃ­gitos (ex: 2024).
- Para cada verba em "fields": "reference" = quantidade/horas/percentual; "value" = valor monetÃ¡rio R$.
- "type" de cada verba deve ser "provento" ou "desconto".
- NÃƒO inclua totais ou bases dentro do array "fields".
- Se um campo nÃ£o existir, use null ou string vazia â€” NUNCA invente dados.

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
    "name": "Nome do FuncionÃ¡rio",
    "cpf": "CPF ou null",
    "registration": "MatrÃ­cula ou null",
    "role": "Cargo ou null",
    "department": "Departamento ou null",
    "admissionDate": "DD/MM/YYYY ou null"
  },
  "bankInfo": {
    "bank": "Banco ou null",
    "agency": "AgÃªncia ou null",
    "account": "Conta ou null"
  },
  "fields": [
    {
      "code": "CÃ³digo numÃ©rico ou null",
      "label": "DescriÃ§Ã£o exata da verba",
      "reference": "Qtd/Horas/Percentual ou null",
      "value": "Valor monetÃ¡rio R$",
      "type": "provento ou desconto"
    }
  ],
  "totals": {
    "totalAdditions": "Total Proventos R$ ou null",
    "totalDeductions": "Total Descontos R$ ou null",
    "netValue": "Valor LÃ­quido R$ ou null"
  },
  "bases": [
    { "label": "Nome exato da base (ex: Base INSS)", "value": "Valor R$" }
  ]
}`;

const PROMPT_TIME_CARD = `Você transcreve cartões de ponto brasileiros. Retorne somente JSON. Preserve estritamente a ordem visual de cima para baixo e inclua todos os dias impressos, inclusive sem batidas. Extraia apenas texto visualmente legível: se data ou horário estiver ilegível ou impreciso, use string vazia. Nunca invente, deduza ou complete horários. Batidas devem alternar IN, OUT conforme a ordem visual.
Formato: {"days":[{"date_raw":"DD/MM/AAAA ou vazio","punches":[{"kind":"IN ou OUT","time_raw":"HH:MM ou vazio"}]}]}`;
const PROMPT_TIME_CARD_REVIEW = `Revise a transcrição de cartão de ponto abaixo contra a página fornecida. Corrija somente usando evidência visual. Preserve todas as linhas existentes e a ordem; preencha campo sem leitura confiável com string vazia. Retorne somente {"days":[...]}.`;
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
   * Executa chamada com fallback de modelos (gpt-5.6-luna -> gpt-4o -> gpt-4o-mini)
   */
  async generateCompletionWithFallback(messages, options = {}) {
    const models = ['gpt-5.6-luna', 'gpt-4o', 'gpt-4o-mini'];
    let lastError;

    for (const model of models) {
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

        const response = await this.client.chat.completions.create(requestParams);
        return response.choices[0]?.message?.content || '{}';
      } catch (err) {
        console.warn(`âš ï¸ Modelo OpenAI ${model} falhou ou sofreu limitaÃ§Ã£o (${err.message}). Tentando modelo seguinte...`);
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
    let scannedPageNumbers = [];
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`Arquivo nÃ£o encontrado: ${filePath}`);
      }

      onProgress({ current: 0, total: 0, percentage: 5, message: 'Lendo arquivo PDF e analisando layout...', log: 'Arquivo PDF carregado no servidor. Analisando estrutura...' });

      if (this.isReady() && !options.useMock) {
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
            const blocks = segmentAllMonthBlocks(pdfRawData.pages);
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

            const extractedBlocksRaw = (await Promise.all(blockPromises)).filter(Boolean);
            const parsedObj = { pages: extractedBlocksRaw };
            const normalized = normalizePayrollResponse(parsedObj);

            if (normalized.pages?.length > 0) {
              return normalized;
            }
          }

          // Caso padrÃ£o (Holerite comum por pÃ¡gina)
          const pdfPages = await this.extractPdfTextPages(filePath);
          const totalPages = pdfPages.length;
          scannedPageNumbers = pdfPages
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
            scannedImages = await rasterizePdfPages(filePath, scannedPageNumbers, { scale: 2 });
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
              // LÃª competÃªncia do formato novo (competency.month/year)
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
          console.warn(`âš ï¸ API da OpenAI falhou (${apiErr.message}). Utilizando extrator local em PDF...`);
          onProgress({ current: 0, total: 0, percentage: 10, message: 'Utilizando extrator local de PDF...', log: `OpenAI indisponivel (${apiErr.message}). Recorrendo ao extrator local.` });
        }
      }

      // Fallback para o extrator local
      const localResult = await extractPayrollLocalPdf(filePath, options);
      const normalizedLocal = normalizePayrollResponse(localResult);

      const hasFields = normalizedLocal.pages?.some(p => p.fields && p.fields.length > 0);
      if (!hasFields && scannedPageNumbers.length > 0) {
        throw new Error('PDF escaneado/imagem detectado (payroll-04.pdf). NÃ£o foi possÃ­vel extrair dados via OpenAI Vision nem pelo extrator local.');
      }

      return normalizedLocal;

    } catch (error) {
      console.error(`âŒ Erro no parsing via OpenAI (${filePath}):`, error.message);
      if (error.message?.includes('VISION_EXTRACTION') || error.message?.includes('OPENAI') || error.message?.includes('PDF escaneado')) {
        throw error;
      }
      return normalizePayrollResponse({ pages: [] });
    }
  }

  /**
   * Envia o PDF de CartÃ£o de Ponto para a API da OpenAI e retorna o DTO normalizado.
   */
  async parseTimeCard(filePath, options = {}) {
    if (!fs.existsSync(filePath)) throw new Error(`Arquivo não encontrado: ${filePath}`);
    if (!this.isReady() && !options.useMock) throw new Error('A extração de cartão de ponto requer OPENAI_API_KEY; não há fallback com dados simulados.');
    if (options.useMock) return normalizeTimeCardResponse(getMockData(filePath, 'time_card'));
    const onProgress = options.onProgress || (() => {});
    const onPageCompleted = options.onPageCompleted || (() => {});
    const pages = await this.extractPdfTextPages(filePath);
    const visionPages = pages.filter(page => selectTimeCardExtractionStrategy(page.density) === 'VISION_SINGLE_PASS').map(page => page.pageNum);
    const images = visionPages.length ? await rasterizePdfPages(filePath, visionPages, { scale: 2 }) : new Map();
    let completed = 0;
    onProgress({ current: 0, total: pages.length, percentage: 10, message: 'Analisando páginas do cartão de ponto...' });
    const results = await Promise.all(pages.map(async page => {
      const strategy = selectTimeCardExtractionStrategy(page.density);
      const vision = strategy === 'VISION_SINGLE_PASS';
      const input = vision ? [{ type: 'text', text: 'Transcreva esta imagem de cartão de ponto.' }, { type: 'image_url', image_url: { url: images.get(page.pageNum)?.dataUrl, detail: 'high' } }] : page.text;
      const run = async prompt => { const raw = await this.generateCompletionWithFallback([{ role: 'system', content: prompt }, { role: 'user', content: input }]); try { return JSON.parse(raw); } catch { return {}; } };
      let normalized = normalizeTimeCardResponse({ pages: [{ page: page.pageNum, ...(await run(PROMPT_TIME_CARD)) }] }).pages[0];
      const audit = auditTimeCardPage(normalized);
      if (strategy === 'DUAL_PASS' || audit.needsReview) {
        const reviewed = await run(`${PROMPT_TIME_CARD_REVIEW}\nMotivos: ${audit.reasons.join('; ')}`);
        normalized = normalizeTimeCardResponse({ pages: [{ page: page.pageNum, ...reviewed }] }).pages[0];
      }
      completed++;
      onPageCompleted(normalized);
      onProgress({ current: completed, total: pages.length, percentage: Math.min(95, Math.round(10 + completed / pages.length * 85)), message: `Página ${completed} de ${pages.length} concluída` });
      return normalized;
    }));
    return normalizeTimeCardResponse({ pages: results });
  }
  async parseDocument(filePath, documentType, options = {}) {
    if (documentType === 'time_card') {
      return this.parseTimeCard(filePath, options);
    } else if (documentType === 'payroll') {
      return this.parsePayroll(filePath, options);
    } else {
      throw new Error(`Tipo de documento nÃ£o suportado: ${documentType}`);
    }
  }
}

export const openaiService = new OpenAIService();
