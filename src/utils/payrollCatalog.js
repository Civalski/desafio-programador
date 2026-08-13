import { normalizeLabelKey } from './labelNormalizer.js';

// Vocabulário de busca: os rótulos encontrados no documento nunca são substituídos
// por estes nomes. Cada grupo representa uma das famílias comuns em holerites.
const GROUPS = [
  ['remuneracao_principal', 'verba', ['salário base', 'salário contratual', 'salário mensal', 'salário hora', 'vencimento', 'ordenado', 'soldo', 'subsídio', 'remuneração', 'pró-labore', 'honorários', 'produção']],
  ['horas_trabalhadas', 'quantidade', ['horas normais', 'horas trabalhadas', 'horas extras', 'hora extra', 'sobreaviso', 'prontidão', 'banco de horas', 'horas compensadas']],
  ['adicionais', 'verba', ['adicional noturno', 'insalubridade', 'periculosidade', 'transferência', 'antiguidade', 'produtividade', 'quebra de caixa']],
  ['gratificacoes', 'verba', ['gratificação', 'gratificação de função', 'gratificação de cargo', 'assiduidade', 'pontualidade']],
  ['comissoes_variavel', 'verba', ['comissão', 'prêmio', 'premiação', 'bonificação', 'bônus', 'incentivo']],
  ['dsr', 'verba', ['dsr', 'descanso semanal remunerado', 'repouso semanal remunerado', 'reflexo dsr']],
  ['ferias', 'verba', ['férias', 'terço constitucional', 'abono pecuniário', 'adiantamento de férias']],
  ['decimo_terceiro', 'verba', ['13º salário', 'décimo terceiro', 'adiantamento do 13º', '13º proporcional']],
  ['adiantamentos', 'verba', ['adiantamento salarial', 'vale salarial', 'adiantamento quinzenal', 'antecipação salarial']],
  ['vale_transporte', 'verba', ['vale-transporte', 'auxílio-transporte', 'desconto vt', 'vt']],
  ['alimentacao', 'verba', ['vale-refeição', 'vale-alimentação', 'vr', 'va', 'cesta básica', 'ticket refeição']],
  ['assistencia_medica', 'verba', ['plano de saúde', 'assistência médica', 'convênio médico', 'coparticipação médica']],
  ['assistencia_odontologica', 'verba', ['plano odontológico', 'assistência odontológica', 'convênio odontológico']],
  ['seguros', 'verba', ['seguro de vida', 'seguro pessoal', 'seguro funeral', 'seguro acidentes pessoais']],
  ['previdencia', 'verba', ['inss', 'previdência social', 'previdência privada', 'pgbl', 'fundo de pensão']],
  ['imposto_renda', 'verba', ['irrf', 'imposto de renda', 'ir sobre salário', 'ir sobre férias']],
  ['fgts', 'informativo_patronal', ['fgts', 'depósito fgts', 'fgts mensal', 'multa 40% fgts']],
  ['bases_calculo', 'base', ['base inss', 'base irrf', 'base fgts', 'base de férias', 'base de 13º', 'rendimentos tributáveis', 'margem consignável']],
  ['dependentes_ir', 'quantidade', ['dependentes ir', 'número de dependentes', 'dedução por dependente']],
  ['pensao_alimenticia', 'verba', ['pensão alimentícia', 'pensão judicial', 'desconto judicial']],
  ['emprestimos', 'verba', ['empréstimo consignado', 'crédito consignado', 'parcela empréstimo', 'fies']],
  ['convenios', 'verba', ['convênio farmácia', 'convênio supermercado', 'convênio academia', 'compras em convênio']],
  ['sindicato', 'verba', ['contribuição sindical', 'contribuição assistencial', 'mensalidade sindical', 'sindicato']],
  ['associacoes', 'verba', ['mensalidade associação', 'cooperativa', 'clube de funcionários']],
  ['faltas_atrasos', 'verba', ['falta', 'faltas', 'atraso', 'saída antecipada', 'desconto dsr']],
  ['afastamentos', 'verba', ['auxílio-doença', 'afastamento', 'licença médica', 'licença maternidade', 'salário-maternidade']],
  ['salario_familia', 'verba', ['salário-família', 'cota salário-família']],
  ['diarias_viagens', 'verba', ['diária', 'ajuda de custo viagem', 'hospedagem', 'quilometragem', 'pedágio']],
  ['ajuda_custo_reembolsos', 'verba', ['ajuda de custo', 'auxílio home office', 'auxílio creche', 'reembolso de despesas']],
  ['beneficios_diversos', 'verba', ['benefício flexível', 'cartão benefícios', 'gympass', 'wellhub', 'auxílio farmácia']],
  ['plr', 'verba', ['plr', 'participação nos lucros', 'participação nos resultados', 'ppr']],
  ['remuneracao_longo_prazo', 'verba', ['stock options', 'opções de ações', 'rsu', 'lti', 'phantom shares']],
  ['descontos_internos', 'verba', ['outros descontos', 'desconto autorizado', 'desconto de equipamento', 'desconto de uniforme']],
  ['danos_devolucoes', 'verba', ['desconto por dano', 'desconto por avaria', 'devolução de valor', 'estorno']],
  ['retroativos', 'verba', ['salário retroativo', 'diferença salarial', 'reajuste retroativo', 'dissídio', 'complemento salarial']],
  ['rescisao', 'verba', ['saldo de salário', 'aviso prévio', 'verbas rescisórias', 'total rescisão', 'líquido rescisão']],
  ['abonos', 'verba', ['abono', 'abono salarial', 'abono pecuniário', 'abono permanência']],
  ['indenizacoes', 'verba', ['indenização', 'verba indenizatória', 'indenização trabalhista']],
  ['valores_judiciais', 'verba', ['bloqueio judicial', 'penhora', 'acordo judicial', 'pagamento judicial']],
  ['total_proventos', 'totalizador', ['total de proventos', 'total vencimentos', 'total créditos', 'total bruto', 'salário bruto']],
  ['total_descontos', 'totalizador', ['total descontos', 'total débitos', 'descontos totais']],
  ['valor_liquido', 'totalizador', ['salário líquido', 'valor líquido', 'líquido a receber', 'valor creditado']],
  ['outros_totalizadores', 'totalizador', ['total remuneração', 'total tributável', 'total isento', 'total benefícios']],
  ['patronais_informativos', 'informativo_patronal', ['fgts empresa', 'inss patronal', 'rat', 'sat', 'gilrat', 'sistema s', 'custo empresa', 'provisão férias']],
  ['quantidades', 'quantidade', ['quantidade de horas', 'quantidade de dias', 'dias trabalhados', 'dias de férias', 'dias afastados']],
  ['percentuais', 'percentual', ['percentual inss', 'alíquota irrf', 'percentual fgts', 'percentual pensão', 'percentual comissão']],
  ['dados_financeiros', 'base', ['salário base', 'base inss', 'inss', 'base irrf', 'irrf', 'base fgts', 'valor depositado']]
];

export const PAYROLL_CATALOG = Object.freeze(GROUPS.map(([id, kind, aliases]) => Object.freeze({ id, kind, aliases: Object.freeze(aliases) })));

export function classifyPayrollLabel(label = '') {
  const key = normalizeLabelKey(label);
  if (!key) return null;
  let best = null;
  for (const group of PAYROLL_CATALOG) {
    for (const alias of group.aliases) {
      const aliasKey = normalizeLabelKey(alias);
      if (key === aliasKey || key.includes(aliasKey) || aliasKey.includes(key)) {
        if (!best || aliasKey.length > best.matchLength) best = { category: group.id, kind: group.kind, alias, matchLength: aliasKey.length };
      }
    }
  }
  return best && { category: best.category, kind: best.kind, alias: best.alias };
}

export function catalogHintsForLabels(labels = [], limit = 12) {
  const found = [];
  for (const label of labels) {
    const match = classifyPayrollLabel(label);
    if (match && !found.some(item => item.category === match.category)) found.push(match);
  }
  return found.slice(0, limit);
}
