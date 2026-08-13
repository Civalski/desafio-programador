---
name: holerite-extractor
description: Implementar, testar ou depurar a extração OpenAI de holerites.
---

# Extrator de holerite com OpenAI

Use somente `OPENAI_API_KEY` (ou o alias compatível já suportado). Reutilize o serviço OpenAI centralizado; não chame o SDK em controllers/UI nem introduza outro provedor.

1. Use texto nativo do PDF quando houver conteúdo suficiente; em página escaneada, use Vision da OpenAI.
2. Peça saída estruturada e valide/normalize antes de persistir. A resposta do modelo não é fonte de verdade.
3. `fields[]` contém apenas verbas da tabela principal; bases, totais e líquido pertencem a `bases[]`.
4. Valores monetários permanecem strings BR; `year` tem quatro dígitos e `month` está entre `01` e `12`.
5. Preserve ordem e evidência impressa; marque caracteres incertos com `?`, nunca invente valores.
6. Teste com cliente OpenAI mockado, sem chave real/rede, cobrindo texto, Vision, schema inválido e separação `fields`/`bases` quando alterados.

Consulte `../../../.harness/specs/02-domain-holerite.md` e `../../../.harness/specs/06-architecture-ops.md`.

