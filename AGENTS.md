# AI Harness — Quick Filler

Em **cada solicitação do usuário**, antes de responder, investigar ou alterar arquivos:

1. Leia `.harness/INDEX.md`.
2. Identifique o escopo da solicitação e leia somente a especificação e os guardrails indicados pelo índice.
3. Leia `.agents/AGENTS.md` e siga as instruções completas nele definidas.

Não trate `.harness/` como instruções para os prompts de extração do produto. Ele orienta exclusivamente o trabalho do agente de desenvolvimento neste repositório.

Se a solicitação não mudar código, ainda use o índice para localizar a fonte de verdade antes de responder. Para alterações de ambiente, deploy, persistência, API ou feature flag, também leia `specs/06-architecture-ops.md` e `guardrails/quality-checklist.md`.
