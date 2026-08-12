---
name: holerite-extractor
description: Instruções e contexto focado para implementar, testar ou debugar o extrator de Holerites via Mindee API.
---

# Skill: Extrator de Holerite (via API Mindee)

Ative esta skill quando estiver trabalhando no parser de **Holerites**.

---

## 📌 Checklist de Implementação do Extrator

1. **Integração com API Mindee**:
   - Enviar o arquivo PDF enviado para a API do Mindee utilizando a chave `MINDEE_API_KEY`.
   - Processar os campos extraídos pela IA do Mindee e mapeá-los para a estrutura JSON estrita do projeto.

2. **Separação Obrigatória `fields` vs `bases`**:
   - `fields[]`: Apenas verbas (proventos e descontos) da tabela principal.
   - `bases[]`: Apenas `Base INSS`, `Base FGTS`, `Base IRRF`, `Total Vencimentos`, `Total Descontos`, `Valor Líquido`.

3. **Formatação Monetária**:
   - Manter valores como STRING no formato brasileiro (`"2.389,77"`). NUNCA converter para float.

4. **Competência (`year` / `month`)**:
   - `year`: 4 dígitos (`"2020"`).
   - `month`: 2 dígitos com zero à esquerda (`"01"` a `"12"`).

5. **Incerteza (`?`)**:
   - Caracteres não identificados pela IA do Mindee com alta confiança devem ser gravados como `?` no valor ou label.

---

## 🔗 Referência Completa
Consulte a especificação técnica detalhada em [02-domain-holerite.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/02-domain-holerite.md) e [06-architecture-ops.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/06-architecture-ops.md).
