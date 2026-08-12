---
name: holerite-extractor
description: Instruções e contexto focado para implementar, testar ou debugar o extrator de Holerites.
---

# Skill: Extrator de Holerite

Ative esta skill quando estiver trabalhando no parser de **Holerites**.

---

## 📌 Checklist de Implementação do Extrator

1. **Separação Obrigatória `fields` vs `bases`**:
   - `fields[]`: Apenas verbas (proventos e descontos) da tabela principal.
   - `bases[]`: Apenas `Base INSS`, `Base FGTS`, `Base IRRF`, `Total Vencimentos`, `Total Descontos`, `Valor Líquido`.

2. **Formatação Monetária**:
   - Manter valores como STRING no formato brasileiro (`"2.389,77"`). NUNCA converter para float.

3. **Competência (`year` / `month`)**:
   - `year`: 4 dígitos (`"2020"`).
   - `month`: 2 dígitos com zero à esquerda (`"01"` a `"12"`).

4. **Incerteza (`?`)**:
   - Caracteres não identificados com 100% de certeza devem ser gravados como `?` no valor ou label.

---

## 🔗 Referência Completa
Consulte a especificação técnica detalhada em [02-domain-holerite.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/02-domain-holerite.md).
