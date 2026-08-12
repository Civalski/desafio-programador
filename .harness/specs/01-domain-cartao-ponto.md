# Especificação Módular 01: Domínio de Cartão de Ponto

Este módulo descreve todas as regras de negócio, formato de saída JSON e comportamentos exigidos para o extrator de **Cartão de Ponto**.

---

## 📌 Formato de Saída JSON (Obrigatório e Literal)

```jsonc
{
  "pages": [
    {
      "page": 1,
      "days": [
        {
          "date_raw": "21/05/2019",
          "punches": [
            { "kind": "IN",  "time_raw": "08:25", "time_hhmm": "08:25" },
            { "kind": "OUT", "time_raw": "18:25", "time_hhmm": "18:25" }
          ]
        },
        { "date_raw": "25/05/2019", "punches": [] }
      ]
    }
  ]
}
```

---

## 📋 Definição dos Campos

| Campo | Tipo | Descrição & Regras |
|---|---|---|
| `pages[].page` | `number` | Número da página no PDF, iniciando em 1. |
| `days[]` | `array` | Um item por linha do documento, **rigorosamente na ordem em que aparecem**. NUNCA ordene por data. |
| `date_raw` | `string` | Data exatamente como impressa no PDF/imagem, sem normalização. |
| `punches[]` | `array` | Batidas na ordem do documento em pares entrada/saída. Lista vazia `[]` quando o dia não tiver batidas. |
| `kind` | `string` | `"IN"` (entrada) ou `"OUT"` (saída). |
| `time_raw` | `string` | Horário exatamente como impresso. |
| `time_hhmm` | `string` | Horário normalizado para o formato 24h `HH:MM`. |

---

## ⚠️ Regras Cruciais do Cartão de Ponto

1. **Ordenação de Linhas**:
   - A lista `days` segue a ordem física de cima para baixo no documento.
   - NUNCA reordene os dias cronologicamente. Se o documento impresso pular ou inverter dias, a saída DEVE refletir a ordem impressa.

2. **Dias sem Batida (Folga / Ausência)**:
   - Se o cartão lista um dia sem batidas (ex: final de semana, folga), o dia DEVE estar presente em `days` com `punches: []`.
   - NUNCA descarte um dia que conste no documento.

3. **Incerteza e Caracteres Ilegíveis (`?`)**:
   - Se um dígito/caractere estiver ilegível ou incerto, substitua apenas o caractere por `?`:
     - Exemplo: `{ "kind": "IN", "time_raw": "0?:25", "time_hhmm": "0?:25" }`
   - NUNCA chute um horário. NUNCA descarte a linha por ter caracteres duvidosos.

4. **Preservação de Raw**:
   - Mantenha `date_raw` e `time_raw` fiéis ao original para permitir auditoria visual.

---

## 🚨 Alertas Derivados (Calculados em Tempo de Exibição/Exportação)

Estes avisos NÃO são armazenados no JSON; são calculados dinamicamente na interface e na planilha:

1. **Batidas Ímpares**:
   - Ocorre quando o total de elementos em `punches[]` de um dia é um número ímpar (ex: 1 ou 3 batidas, indicando esquecimento de marcação).
   - Destaque visual: Fundo Amarelo (`#FFF3CD`).

2. **Data Não Sequencial**:
   - Ocorre quando a data de uma linha quebra a sequência lógica esperada em relação à linha anterior.
   - Destaque visual: Fundo Vermelho (`#F8D7DA`) com Borda Esquerda Vermelha (`#DC3545`) na primeira célula.

---

## 🧪 Casos de Teste Essenciais
- Cartão com batidas noturnas e pares múltiplos (ex: Entrada 1, Saída 1, Entrada 2, Saída 2).
- Cartão escaneado/imagem sem camada de texto (fallback obrigatório para OCR).
- Cartão com dias ausentes/ausência de batida (`punches: []`).
- Cartão com marcações rasuradas ou parcialmente apagadas (`?`).
