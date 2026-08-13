---
name: cartao-ponto-extractor
description: Implementar, testar ou depurar a extração OpenAI de cartões de ponto.
---

# Extrator de cartão de ponto com OpenAI

Use somente `OPENAI_API_KEY` (ou o alias compatível já suportado). Reutilize o serviço OpenAI centralizado; não chame o SDK em controllers/UI nem introduza outro provedor.

1. Use texto nativo do PDF quando houver conteúdo suficiente; em página escaneada, use Vision da OpenAI.
2. Peça saída estruturada e valide/normalize antes de persistir.
3. Preserve `days[]` na ordem física, `date_raw` e `time_raw` impressos, e batidas `IN`/`OUT` na ordem original.
4. Inclua dias sem batidas como `punches: []`; nunca gere data impossível nem descarte linha parcialmente legível.
5. Marque apenas o caractere incerto com `?`; não invente horário ou data.
6. Teste com cliente OpenAI mockado, sem chave real/rede, cobrindo texto, Vision, schema inválido e incerteza quando alterados.

Consulte `../../../.harness/specs/01-domain-cartao-ponto.md` e `../../../.harness/specs/06-architecture-ops.md`.

