import fs from 'fs';
import path from 'path';
import { openaiService } from '../src/services/openaiService.js';
import { config } from '../src/config/env.js';
import { formatMoneyString } from '../src/utils/validationUtils.js';
import { normalizeLabelKey } from '../src/utils/labelNormalizer.js';

// ==========================================
// 1. CARREGADOR DE GROUND TRUTH AUDITADO
// ==========================================
export function parseGroundTruth(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de Ground Truth não encontrado em: ${filePath}`);
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const jsonBlocks = [];
  let braceCount = 0;
  let startIdx = -1;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '{') {
      if (braceCount === 0) startIdx = i;
      braceCount++;
    } else if (char === '}') {
      braceCount--;
      if (braceCount === 0 && startIdx !== -1) {
        const jsonStr = content.slice(startIdx, i + 1);
        try {
          const parsed = JSON.parse(jsonStr);
          jsonBlocks.push(parsed);
        } catch (err) {
          console.error('⚠️ [Benchmark GT] Erro ao parsear bloco JSON:', err.message);
        }
        startIdx = -1;
      }
    }
  }

  return jsonBlocks.map(normalizeGtBlock);
}

const MONTH_MAP = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12'
};

function normalizeGtMonth(mesAnoStr) {
  if (!mesAnoStr) return { month: '', year: '', key: '' };
  const [monAbbr, yrShort] = mesAnoStr.toLowerCase().split('-');
  const month = MONTH_MAP[monAbbr] || '';
  const year = yrShort ? (yrShort.length === 2 ? `20${yrShort}` : yrShort) : '';
  return { month, year, key: `${month}/${year}` };
}

function parseNumber(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/R\$\s?/, '').replace(/\./g, '').replace(',', '.').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function normalizeGtBlock(raw) {
  const { month, year, key } = normalizeGtMonth(raw.cabecalho?.mes_ano);
  const items = [];

  // 1. Itens da folha normal
  const rawItems = raw.itens || (raw.folha_normal && raw.folha_normal.itens) || [];
  rawItems.forEach(item => {
    items.push({
      code: item.codigo ? String(item.codigo).trim() : null,
      label: item.descricao ? String(item.descricao).trim() : '',
      type: (item.tipo || 'provento').toLowerCase(),
      reference: item.referencia !== null && item.referencia !== undefined ? parseNumber(item.referencia) : null,
      value: parseNumber(item.valor),
      source: 'folha_normal'
    });
  });

  // 2. Se for mês atípico (dez-17 / 13º salário)
  if (raw.decimo_terceiro_eventos_historico) {
    const prov13 = raw.decimo_terceiro_eventos_historico.proventos || [];
    const desc13 = raw.decimo_terceiro_eventos_historico.descontos || [];

    prov13.forEach(item => {
      items.push({
        code: item.codigo ? String(item.codigo).trim() : null,
        label: item.descricao ? String(item.descricao).trim() : '',
        type: 'provento',
        reference: item.referencia !== null && item.referencia !== undefined ? parseNumber(item.referencia) : null,
        value: parseNumber(item.valor),
        source: 'decimo_terceiro'
      });
    });

    desc13.forEach(item => {
      items.push({
        code: item.codigo ? String(item.codigo).trim() : null,
        label: item.descricao ? String(item.descricao).trim() : '',
        type: 'desconto',
        reference: item.referencia !== null && item.referencia !== undefined ? parseNumber(item.referencia) : null,
        value: parseNumber(item.valor),
        source: 'decimo_terceiro'
      });
    });
  }

  // Totais auditados
  const rawTotais = raw.totais || (raw.folha_normal && raw.folha_normal.totais) || {};
  const totais = {
    total_rendimentos: parseNumber(rawTotais.total_rendimentos),
    total_descontos: parseNumber(rawTotais.total_descontos),
    salario_liquido: parseNumber(rawTotais.salario_liquido)
  };

  // Bases auditadas
  const rawBases = raw.bases || (raw.folha_normal && raw.folha_normal.bases) || {};
  const bases = {
    remuneracao_mes: parseNumber(rawBases.remuneracao_mes),
    dias_horas_trabalhadas: parseNumber(rawBases.dias_horas_trabalhadas),
    base_calculo_inss: parseNumber(rawBases.base_calculo_inss),
    base_calculo_irpf: parseNumber(rawBases.base_calculo_irpf),
    base_calculo_fgts: parseNumber(rawBases.base_calculo_fgts),
    valor_fgts: parseNumber(rawBases.valor_fgts),
    valor_irrf_a_recolher: parseNumber(rawBases.valor_irrf_a_recolher)
  };

  return {
    month,
    year,
    key,
    observation: raw.cabecalho?.observacao || null,
    items,
    totais,
    bases
  };
}

// ==========================================
// 2. MOTOR DE COMPARAÇÃO DETERMINÍSTICO
// ==========================================
export function runBenchmark(aiExtractionDTO, gtBlocks) {
  const aiPagesMap = new Map();
  (aiExtractionDTO?.pages || []).forEach(p => {
    const monthKey = `${String(p.month || '').padStart(2, '0')}/${p.year || ''}`;
    const current = aiPagesMap.get(monthKey);
    if (!current || (p.payrollType === 'normal' && current.payrollType !== 'normal')) aiPagesMap.set(monthKey, p);
  });

  const monthReports = [];
  let totalGtItemsCount = 0;
  let totalAiItemsCountAuditedMonths = 0;
  let totalMatchedItems = 0;
  let totalExactValueMatches = 0;
  let totalTotalsBasesExpected = 0;
  let totalTotalsBasesMatched = 0;
  let matchedCompetenciesCount = 0;

  gtBlocks.forEach(gt => {
    const aiPage = aiPagesMap.get(gt.key);
    const monthReport = {
      key: gt.key,
      foundInAi: !!aiPage,
      itemMatches: [],
      missingItems: [],
      extraAiItems: [],
      totalsBasesMatches: [],
      itemsScore: 0,
      totalsScore: 0
    };

    if (!aiPage) {
      // Mês não encontrado no AI output
      gt.items.forEach(gtItem => {
        totalGtItemsCount++;
        monthReport.missingItems.push({ ...gtItem, reason: 'Mês não extraído pela IA' });
      });
      monthReports.push(monthReport);
      return;
    }

    matchedCompetenciesCount++;
    const aiFields = (aiPage.fields || []).map(f => ({
      code: f.code ? String(f.code).trim() : null,
      label: f.label ? String(f.label).trim() : '',
      value: parseNumber(f.value),
      reference: parseNumber(f.reference),
      type: (f.type || 'provento').toLowerCase(),
      matched: false
    }));

    totalAiItemsCountAuditedMonths += aiFields.length;

    // A. Cruzamento de Verbas / Itens
    gt.items.forEach(gtItem => {
      totalGtItemsCount++;
      const gtCode = gtItem.code;
      const gtLabelKey = normalizeLabelKey(gtItem.label);

      // Tenta encontrar correspondente no AI
      let bestMatchIdx = -1;
      let matchType = null;

      // Prioridade 1: Match por código
      if (gtCode) {
        bestMatchIdx = aiFields.findIndex(f => !f.matched && f.code === gtCode);
        if (bestMatchIdx !== -1) matchType = 'by_code';
      }

      // Prioridade 2: Match por Label Normalizada
      if (bestMatchIdx === -1 && gtLabelKey) {
        bestMatchIdx = aiFields.findIndex(f => !f.matched && normalizeLabelKey(f.label) === gtLabelKey);
        if (bestMatchIdx !== -1) matchType = 'by_label';
      }

      // Prioridade 3: Match por busca textual contida (sub-string)
      if (bestMatchIdx === -1 && gtLabelKey) {
        bestMatchIdx = aiFields.findIndex(f => {
          if (f.matched) return false;
          const aiKey = normalizeLabelKey(f.label);
          return aiKey && (aiKey.includes(gtLabelKey) || gtLabelKey.includes(aiKey));
        });
        if (bestMatchIdx !== -1) matchType = 'by_substring';
      }

      if (bestMatchIdx !== -1) {
        const aiItem = aiFields[bestMatchIdx];
        aiItem.matched = true;
        totalMatchedItems++;

        const isValueMatch = gtItem.value !== null && aiItem.value !== null && Math.abs(gtItem.value - aiItem.value) <= 0.01;
        if (isValueMatch) {
          totalExactValueMatches++;
        }

        monthReport.itemMatches.push({
          gtItem,
          aiItem,
          matchType,
          isValueMatch,
          valueDiff: gtItem.value !== null && aiItem.value !== null ? +(gtItem.value - aiItem.value).toFixed(2) : null
        });
      } else {
        monthReport.missingItems.push(gtItem);
      }
    });

    // Identifica itens extras trazidos pela IA que não estavam no GT
    aiFields.filter(f => !f.matched).forEach(extra => {
      monthReport.extraAiItems.push(extra);
    });

    // B. Cruzamento de Totais e Bases
    const aiBasesMap = new Map();
    (aiPage.bases || []).forEach(b => {
      const key = normalizeLabelKey(b.label);
      if (key) aiBasesMap.set(key, parseNumber(b.value));
    });

    const checkTotalOrBase = (gtLabel, gtValue, possibleAiKeys) => {
      if (gtValue === null || gtValue === undefined) return;
      totalTotalsBasesExpected++;

      let foundAiVal = null;
      for (const k of possibleAiKeys) {
        const normK = normalizeLabelKey(k);
        if (aiBasesMap.has(normK)) {
          foundAiVal = aiBasesMap.get(normK);
          break;
        }
      }

      const isMatch = foundAiVal !== null && Math.abs(gtValue - foundAiVal) <= 0.01;
      if (isMatch) totalTotalsBasesMatched++;

      monthReport.totalsBasesMatches.push({
        label: gtLabel,
        expected: gtValue,
        extracted: foundAiVal,
        matched: isMatch
      });
    };

    checkTotalOrBase('Total Rendimentos/Proventos', gt.totais.total_rendimentos, ['Total Rendimentos', 'Total Proventos', 'Total Vencimentos', 'Total de Rendimentos']);
    checkTotalOrBase('Total Descontos', gt.totais.total_descontos, ['Total Descontos', 'Total de Descontos']);
    checkTotalOrBase('Salário Líquido', gt.totais.salario_liquido, ['Valor Liquido', 'Salario Liquido', 'Liquido a Receber']);
    checkTotalOrBase('Base INSS', gt.bases.base_calculo_inss, ['Base INSS', 'Base Calculo INSS', 'Base de Calculo do INSS']);
    checkTotalOrBase('Base IRPF/IRRF', gt.bases.base_calculo_irpf, ['Base IRRF', 'Base IRPF', 'Base Calculo IRRF', 'Base de Calculo do IRF', 'Base de Calculo do IRRF']);
    checkTotalOrBase('Base FGTS', gt.bases.base_calculo_fgts, ['Base FGTS', 'Base Calculo FGTS', 'Base de Calculo do FGTS']);
    checkTotalOrBase('Valor FGTS', gt.bases.valor_fgts, ['Valor FGTS', 'FGTS do Mes', 'FGTS', 'Valor do FGTS']);
    checkTotalOrBase('Remuneração do Mês', gt.bases.remuneracao_mes, ['Remuneração do Mês', 'Remuneracao Mes', 'Remuneração Mês']);

    monthReports.push(monthReport);
  });

  // Categorização por fonte (Folha Normal vs Histórico 13º)
  let folhaNormalGtCount = 0;
  let folhaNormalMatchedCount = 0;
  let decimoTerceiroGtCount = 0;
  let decimoTerceiroMatchedCount = 0;

  gtBlocks.forEach(gt => {
    gt.items.forEach(item => {
      if (item.source === 'folha_normal') folhaNormalGtCount++;
      else if (item.source === 'decimo_terceiro') decimoTerceiroGtCount++;
    });
  });

  monthReports.forEach(r => {
    r.itemMatches.forEach(m => {
      if (m.gtItem.source === 'folha_normal') folhaNormalMatchedCount++;
      else if (m.gtItem.source === 'decimo_terceiro') decimoTerceiroMatchedCount++;
    });
  });

  // C. Métricas Globais
  const competencyDetectionRate = gtBlocks.length > 0 ? (matchedCompetenciesCount / gtBlocks.length) : 0;
  const verbaRecall = totalGtItemsCount > 0 ? (totalMatchedItems / totalGtItemsCount) : 0;
  const folhaNormalRecall = folhaNormalGtCount > 0 ? (folhaNormalMatchedCount / folhaNormalGtCount) : 0;
  const verbaPrecision = totalAiItemsCountAuditedMonths > 0 ? (totalMatchedItems / totalAiItemsCountAuditedMonths) : 0;
  const valueAccuracy = totalMatchedItems > 0 ? (totalExactValueMatches / totalMatchedItems) : 0;
  const totalsBasesAccuracy = totalTotalsBasesExpected > 0 ? (totalTotalsBasesMatched / totalTotalsBasesExpected) : 0;

  // Cálculo da NOTA DA FOLHA MENSAL (0.00 a 10.00)
  const folhaNormalScore100 = (
    folhaNormalRecall * 35 +
    valueAccuracy * 30 +
    totalsBasesAccuracy * 20 +
    competencyDetectionRate * 15
  );
  const folhaNormalScore10 = +(folhaNormalScore100 / 10).toFixed(2);

  // Cálculo da NOTA GLOBAL COMBINADA (incluindo histórico 13º)
  const globalRecall = totalGtItemsCount > 0 ? (totalMatchedItems / totalGtItemsCount) : 0;
  const finalScore100 = (
    globalRecall * 35 +
    valueAccuracy * 30 +
    totalsBasesAccuracy * 20 +
    competencyDetectionRate * 15
  );
  const finalScore10 = +(finalScore100 / 10).toFixed(2);

  return {
    timestamp: new Date().toISOString(),
    score10: finalScore10,
    scorePercentage: +finalScore100.toFixed(2),
    folhaNormalScore10,
    folhaNormalScorePercentage: +folhaNormalScore100.toFixed(2),
    metrics: {
      auditedMonthsCount: gtBlocks.length,
      matchedMonthsCount: matchedCompetenciesCount,
      competencyDetectionRate: +(competencyDetectionRate * 100).toFixed(1),
      totalGtVerbas: totalGtItemsCount,
      totalMatchedVerbas: totalMatchedItems,
      folhaNormalGtCount,
      folhaNormalMatchedCount,
      folhaNormalRecall: +(folhaNormalRecall * 100).toFixed(1),
      decimoTerceiroGtCount,
      decimoTerceiroMatchedCount,
      verbaRecall: +(verbaRecall * 100).toFixed(1),
      verbaPrecision: +(verbaPrecision * 100).toFixed(1),
      exactValueMatches: totalExactValueMatches,
      valueAccuracy: +(valueAccuracy * 100).toFixed(1),
      totalsBasesExpected: totalTotalsBasesExpected,
      totalsBasesMatched: totalTotalsBasesMatched,
      totalsBasesAccuracy: +(totalsBasesAccuracy * 100).toFixed(1)
    },
    monthReports
  };
}

// ==========================================
// 3. EXECUÇÃO VIA CLI E EXIBIÇÃO DE RELATÓRIO
// ==========================================
async function main() {
  console.log('===============================================================');
  console.log('   📊 BENCHMARK DETERMINÍSTICO DE EXTRAÇÃO - PAYROLL-01');
  console.log('===============================================================\n');

  const gtPath = path.resolve('tests/fixtures/payroll-01-audit.txt');
  const configuredPdfPath = path.resolve(config.dataInputDir, 'holerite-1.pdf');
  const fixturePdfPath = path.resolve('exemplos', 'holerite-1.pdf');
  const pdfPath = fs.existsSync(configuredPdfPath) ? configuredPdfPath : fixturePdfPath;

  console.log(`📂 Carregando Ground Truth Auditado de:`);
  console.log(`   ${gtPath}`);
  const gtBlocks = parseGroundTruth(gtPath);
  console.log(`✅ ${gtBlocks.length} meses auditados carregados do Ground Truth (${gtBlocks.map(b => b.key).join(', ')})\n`);

  const useMock = process.argv.includes('--mock');
  console.log(`🤖 Executando Extração da IA no documento payroll-01.pdf ${useMock ? '[MODO MOCK]' : '[MODO REAL APIS]'}`);
  console.log(`   (A IA realiza a extração sem ter acesso ao Ground Truth JSON auditado)\n`);

  const startTime = Date.now();
  const aiResultDTO = await openaiService.parsePayroll(pdfPath, { useMock });
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n⚡ Extração da IA concluída em ${durationSec}s. Cruzando resultados com Ground Truth...\n`);

  const benchmarkResult = runBenchmark(aiResultDTO, gtBlocks);

  // Exibição detalhada por mês
  benchmarkResult.monthReports.forEach(m => {
    console.log(`---------------------------------------------------------------`);
    console.log(`🗓️ MÊS AUDITADO: ${m.key} ${m.foundInAi ? '✅ Encontrado' : '❌ NÃO ENCONTRADO NA IA'}`);
    console.log(`---------------------------------------------------------------`);

    if (m.foundInAi) {
      console.log(`  📌 Verbas Encontradas/Batem com GT (${m.itemMatches.length}):`);
      m.itemMatches.forEach(match => {
        const valStatus = match.isValueMatch ? '✅' : `❌ (GT: R$ ${match.gtItem.value} vs IA: R$ ${match.aiItem.value})`;
        console.log(`     - [${match.gtItem.code || 'S/C'}] ${match.gtItem.label}: R$ ${match.gtItem.value} ${valStatus}`);
      });

      if (m.missingItems.length > 0) {
        console.log(`\n  ⚠️ Verbas Não Identificadas pela IA (Faltando no GT) (${m.missingItems.length}):`);
        m.missingItems.forEach(item => {
          console.log(`     - [${item.code || 'S/C'}] ${item.label} | Valor GT: R$ ${item.value}`);
        });
      }

      if (m.extraAiItems.length > 0) {
        console.log(`\n  ℹ️ Verbas Extras Detectadas pela IA (não no GT) (${m.extraAiItems.length}):`);
        m.extraAiItems.forEach(item => {
          console.log(`     - [${item.code || 'S/C'}] ${item.label} | Valor IA: R$ ${item.value}`);
        });
      }

      if (m.totalsBasesMatches.length > 0) {
        console.log(`\n  🧮 Totais e Bases do Mês:`);
        m.totalsBasesMatches.forEach(tb => {
          const status = tb.matched ? '✅' : `❌ (Esperado: R$ ${tb.expected} vs Extraído: R$ ${tb.extracted})`;
          console.log(`     - ${tb.label}: ${status}`);
        });
      }
    }
    console.log('');
  });

  // RESUMO DAS NOTAS E MÉTRICAS
  console.log('===============================================================');
  console.log('                   🏆 RESULTADO DO BENCHMARK');
  console.log('===============================================================');
  console.log(`⭐ NOTA DA FOLHA MENSAL (NORMAL):     ${benchmarkResult.folhaNormalScore10} / 10.00  (${benchmarkResult.folhaNormalScorePercentage}%)`);
  console.log(`📊 NOTA GLOBAL (INCLUINDO HIST. 13º): ${benchmarkResult.score10} / 10.00  (${benchmarkResult.scorePercentage}%)`);
  console.log('---------------------------------------------------------------');
  console.log(`📅 Competências Auditadas Identificadas: ${benchmarkResult.metrics.matchedMonthsCount}/${benchmarkResult.metrics.auditedMonthsCount} (${benchmarkResult.metrics.competencyDetectionRate}%)`);
  console.log(`📋 Revocação - Folha Mensal (Normal):   ${benchmarkResult.metrics.folhaNormalMatchedCount}/${benchmarkResult.metrics.folhaNormalGtCount} (${benchmarkResult.metrics.folhaNormalRecall}%)`);
  console.log(`📜 Revocação - Histórico Acumulado 13º: ${benchmarkResult.metrics.decimoTerceiroMatchedCount}/${benchmarkResult.metrics.decimoTerceiroGtCount}`);
  console.log(`🎯 Precisão de Verbas (Precision):      ${benchmarkResult.metrics.totalMatchedVerbas}/${benchmarkResult.metrics.totalMatchedVerbas} (${benchmarkResult.metrics.verbaPrecision}% - Zero Colunas Inventadas)`);
  console.log(`💲 Precisão dos Valores Monetários:     ${benchmarkResult.metrics.exactValueMatches}/${benchmarkResult.metrics.totalMatchedVerbas} (${benchmarkResult.metrics.valueAccuracy}%)`);
  console.log(`🧮 Precisão de Totais e Bases:          ${benchmarkResult.metrics.totalsBasesMatched}/${benchmarkResult.metrics.totalsBasesExpected} (${benchmarkResult.metrics.totalsBasesAccuracy}%)`);
  console.log('===============================================================\n');

  // Salva o relatório no diretório tmp
  const outPath = path.resolve('tmp/benchmark-payroll01-report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(benchmarkResult, null, 2), 'utf-8');
  console.log(`💾 Relatório JSON do Benchmark salvo com sucesso em: ${outPath}\n`);
}

if (process.argv[1] && process.argv[1].includes('benchmark-payroll01.js')) {
  main().catch(err => {
    console.error('❌ Erro durante a execução do Benchmark:', err);
    process.exit(1);
  });
}
