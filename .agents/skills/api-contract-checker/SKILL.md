---
name: api-contract-checker
description: Instruções e contexto focado para validar e construir os endpoints da API HTTP.
---

# Skill: Validador de Contratos da API HTTP

Ative esta skill quando estiver criando ou alterando endpoints da API HTTP.

---

## 📌 Endpoints a Validar

1. `POST /api/transcricoes` -> Responde `202 Accepted` com `{ "id": "..." }`. Processamento ocorre de forma assíncrona.
2. `GET /api/transcricoes/:id` -> Responde `200 OK` com status (`processando` | `concluido` | `erro`) e `value`.
3. `PUT /api/transcricoes/:id` -> Atualiza a transcrição com correções da interface.
4. `GET /api/transcricoes/:id/planilha` -> Retorna arquivo `.xlsx`, `.csv` ou `.json`.
5. `GET /healthz` -> Responde `200 OK` com `{ "status": "ok" }`.

---

## 🔗 Referência Completa
Consulte a especificação técnica detalhada em [03-api-contracts.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/03-api-contracts.md).
