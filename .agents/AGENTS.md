# Regras Globais & Context Router do Agente (AI Harness)

Este repositório possui uma infraestrutura de **AI Harness** para garantir que o desenvolvimento de código ocorra com a máxima qualidade, precisão e eficiência de tokens, aplicando **Progressive Disclosure** e **Context Routing**.

---

## 🎯 Protocolo de Atuação do Agente

1. **Eficiência de Tokens (Progressive Disclosure)**:
   - NUNCA recarregue especificações completas não relacionadas à tarefa atual.
   - Antes de iniciar qualquer subtarefa, consulte o mapa de roteamento em [.harness/INDEX.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/INDEX.md) e leia apenas a especificação modular necessária localizada em `.harness/specs/`.

2. **Princípios Inegociáveis do Domínio**:
   - **Honestidade dos Dados (`?`)**: Um caractere ilegível DEVE ser marcado como `?`. NUNCA invente ou chute valores. Incerteza é por caractere, não por linha.
   - **Formato Monetário**: Valores monetários são STRINGS no formato brasileiro (ex: `"2.389,77"`). NUNCA converta para `float` ou `number`.
   - **Preservação do Original (`_raw`)**: Mantenha sempre `date_raw` e `time_raw` exatamente como impressos.
   - **Datas Válidas**: NUNCA produza datas ou meses impossíveis (ex: `38/07`, mês `13`).
   - **Arquitetura Unificada**: Cartão de ponto e holerite compartilham 100% do pipeline (upload, fila assíncrona, interface de revisão, edição e download). NUNCA crie duas aplicações separadas.
   - **Processamento HTTP Assíncrono**: NUNCA processe a extração dentro da requisição HTTP síncrona. O endpoint `POST /api/transcricoes` devolve `202 Accepted` com `id`, e o processamento roda em segundo plano.

3. **Validação e Verificação**:
   - Antes de declarar qualquer subtarefa concluída, consulte [.harness/guardrails/quality-checklist.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/guardrails/quality-checklist.md).
   - Verifique a presença de anti-patterns descritos em [.harness/guardrails/anti-patterns.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/guardrails/anti-patterns.md).

---

## 🗺️ Context Routing Table (Mapa de Roteamento)

Quando for executar uma tarefa específica, carregue o contexto apontado abaixo:

| Tarefa / Escopo | Módulo de Especificação | Skill / Regra a Ativar |
|---|---|---|
| Extração de Cartão de Ponto | [01-domain-cartao-ponto.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/01-domain-cartao-ponto.md) | `cartao-ponto-extractor` |
| Extração de Holerite | [02-domain-holerite.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/02-domain-holerite.md) | `holerite-extractor` |
| Endpoints HTTP e Fila Assíncrona | [03-api-contracts.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/03-api-contracts.md) | `api-contract-checker` |
| Geração de Excel / CSV / JSON e Cores | [04-excel-export.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/04-excel-export.md) | `excel-generator` |
| Interface Web de Revisão Lado a Lado | [05-frontend-ui.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/05-frontend-ui.md) | — |
| Arquitetura, Docker e Segurança | [06-architecture-ops.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/06-architecture-ops.md) | — |
| Documentação `SOLUCAO.md` e `PROCESSO.md` | [07-documentation-deliverables.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/07-documentation-deliverables.md) | `process-logger` |
| Critérios de Avaliação e Notas | [08-evaluation-rubric.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/08-evaluation-rubric.md) | — |
