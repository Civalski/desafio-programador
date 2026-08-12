# Especificação Modular 02: Domínio de Holerite

Este módulo descreve todas as regras de negócio, formato de saída JSON e a regra central de separação entre verbas (`fields`) e bases/totais (`bases`) para o extrator de **Holerite**.

---

## 📌 Formato de Saída JSON (Obrigatório e Literal)

```jsonc
{
  "pages": [
    {
      "page": 1,
      "year": "2020",
      "month": "01",
      "fields": [
        { "code": "0010", "label": "Salário Base",     "reference": "220,00", "value": "2.389,77" },
        { "code": "5560", "label": "Horas Extras - 50%", "reference": "8,00",  "value": "155,91" },
        { "code": "0998", "label": "INSS",              "reference": "",      "value": "262,87" }
      ],
      "bases": [
        { "label": "Base INSS",        "value": "2.545,68" },
        { "label": "Total Vencimentos", "value": "2.545,68" },
        { "label": "Valor Líquido",     "value": "2.282,81" }
      ]
    }
  ]
}
```

---

## 📋 Definição dos Campos

| Campo | Tipo | Descrição & Regras |
|---|---|---|
| `page` | `number` | Número da página no PDF, iniciando em 1. |
| `year` | `string` | Ano da competência como string de 4 dígitos (ex: `"2020"`). |
| `month` | `string` | Mês da competência com 2 dígitos, zero à esquerda (ex: `"01"` a `"12"`). |
| `fields[]` | `array` | **SOMENTE** as verbas da tabela principal de vencimentos e descontos. |
| `code` | `string` | Código da verba impresso. String vazia `""` quando ausente. |
| `label` | `string` | Descrição exata da verba impressa, **SEM O CÓDIGO**. |
| `reference` | `string` | Coluna de referência/quantidade (QTDE, REF). String vazia `""` quando ausente. |
| `value` | `string` | Valor monetário formatado. |
| `bases[]` | `array` | **SOMENTE** as bases e totais da seção separada (abaixo ou fora da tabela principal). |

---

## 💥 Regra Central de Separação: `fields` vs `bases`

> [!CAUTION]
> **NUNCA MISTURE `fields` E `bases`**
> - **`fields[]`**: Contém APENAS proventos (vencimentos) e descontos individuais (ex: Salário Base, Horas Extras, INSS, Vale Transporte).
> - **`bases[]`**: Contém APENAS bases de cálculo, totais e resumos (ex: `Base INSS`, `Base FGTS`, `Base IRRF`, `Total Vencimentos`, `Total Descontos`, `Valor Líquido`).
> - **Consequência de Erro**: Se um item como `Base INSS` ou `Valor Líquido` entrar em `fields[]`, ele se tornará uma coluna de verba na planilha transposta e contaminará toda a matriz de exportação.

---

## 💲 Regras Monetárias e Competência

1. **Valores Monetários como STRING**:
   - O valor monetário DEVE ser mantido no formato brasileiro como string: `"2.389,77"`.
   - NUNCA converta para número flutuante (ex: `2389.77`). Converter para float perde o formato original impresso e causa erros de arredondamento.

2. **Incerteza (`?`)**:
   - Digito ilegível em valor: `"2.3?9,77"`.
   - Incerteza é informada por caractere individual.

---

## 🚨 Alertas Derivados (Calculados em Tempo de Exibição/Exportação)

1. **Página Vazia**:
   - A página existe no PDF, mas nenhum dado pôde ser extraído dela.
   - Destaque visual: Fundo Amarelo (`#FFF3CD`).

2. **Mês Não Sequencial**:
   - A competência da página não é o mês exatamente posterior à página anterior (ex: pular de `01/2020` para `03/2020`).
   - Nota: `12` para `01` do ano seguinte é considerado consecutivo. Páginas com mês ilegível não quebram a cadeia; compara-se a próxima legível.
   - Destaque visual: Fundo Vermelho (`#F8D7DA`) com Borda Esquerda Vermelha (`#DC3545`).

---

## 🧪 Casos de Teste Essenciais
- Holerite com múltiplos proventos e descontos.
- Holerite com seção de bases rodapé contendo `Base INSS`, `Base FGTS` e `Valor Líquido`.
- Holerite escaneado (sem camada de texto) que requer OCR.
- Holerite com verba sem código ou sem coluna de referência.
