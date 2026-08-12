# AI Harness - Índice de Roteamento de Especificações

Este documento é a central de navegação para a documentação modular do projeto Quick Filler. Cada especificação foi dividida isoladamente para permitir a navegação por **Progressive Disclosure**, economizando contexto e aumentando a precisão das respostas do agente de IA.

---

## 📚 Módulos de Especificação (`.harness/specs/`)

1. 📄 [01-domain-cartao-ponto.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/01-domain-cartao-ponto.md)
   - Contrato JSON completo de Cartão de Ponto.
   - Regras de batidas (`IN`/`OUT`), `time_raw` vs `time_hhmm`, ordenação original de linhas, dias sem batida.
   - Regras de cálculo de alertas (batidas ímpares, datas não sequenciais).

2. 🧾 [02-domain-holerite.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/02-domain-holerite.md)
   - Contrato JSON completo de Holerite.
   - Separação estrita entre `fields` (verbas) e `bases` (bases/totais/líquido).
   - Formatação monetária em string, competência (`year`/`month`).
   - Regras de cálculo de alertas (página vazia, mês não sequencial).

3. 🔌 [03-api-contracts.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/03-api-contracts.md)
   - Endpoints HTTP literais: `POST /api/transcricoes`, `GET /api/transcricoes/:id`, `PUT /api/transcricoes/:id`, `GET /api/transcricoes/:id/planilha`, `GET /healthz`.
   - Máquina de estados do processamento (`processando`, `concluido`, `erro`).

4. 📊 [04-excel-export.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/04-excel-export.md)
   - Regras de montagem de planilhas Excel (`.xlsx`), CSV e JSON.
   - Transposição de matrizes de verbas e dinamismo de colunas de batidas.
   - Estilização visual (cabeçalho `#173772`, avisos amarelo `#FFF3CD` e vermelho `#F8D7DA` com borda `#DC3545`).

5. 🖥️ [05-frontend-ui.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/05-frontend-ui.md)
   - Interface web de revisão com visualização de PDF lado a lado com tabela editável.
   - Feedback de status assíncrono e atualização ao vivo de edições.

6. 🐳 [06-architecture-ops.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/06-architecture-ops.md)
   - Arquitetura de pipeline único compartilhado.
   - Requisitos de Docker Compose (`docker compose up`), OCR (Tesseract / Cloud) e segurança/privacidade (retenção PII, limites upload).

7. 📝 [07-documentation-deliverables.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/07-documentation-deliverables.md)
   - Diretrizes obrigatórias para escrita de `SOLUCAO.md` e `PROCESSO.md`.
   - Questões obrigatórias de uso de IA e justificativa de decisões técnicas.

8. 🎯 [08-evaluation-rubric.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/08-evaluation-rubric.md)
   - Tabela de pesos da avaliação (Precisão 30%, Honestidade 15%, Ciclo Completo 20%, Arquitetura 15%, Segurança 10%, Código 10%).

---

## 🛡️ Guardrails & Checklists (`.harness/guardrails/`)

- 🛑 [anti-patterns.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/guardrails/anti-patterns.md) — Erros comuns e condutas proibidas.
- ✅ [quality-checklist.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/guardrails/quality-checklist.md) — Lista de checagem pré-submissão de código.
