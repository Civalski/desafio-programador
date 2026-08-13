# Especificação 06 — Arquitetura, OpenAI, Docker e Operação

## Arquitetura

O sistema possui um pipeline único: validação de upload → criação do job → processamento em segundo plano → revisão → exportação. Cartão de ponto e holerite compartilham infraestrutura; apenas parsers, schemas e formatadores variam.

Separe HTTP, orquestração de jobs, extração OpenAI, normalização/validação de domínio e exportação. `POST /api/transcricoes` deve retornar rapidamente (`202` + `id`); extração não pode bloquear a requisição.

## OpenAI

OpenAI é o único provedor de IA. Use `OPENAI_API_KEY`; `OPENAI_SECRET_KEY` pode permanecer somente como alias de compatibilidade. Nunca use, introduza ou documente Mindee, Gemini ou outro provedor.

Fluxo por página:

1. Extraia a camada de texto quando houver conteúdo útil.
2. Em PDF/página escaneada ou sem texto, rasterize a página e use Vision da OpenAI.
3. Solicite JSON estruturado com o schema interno mínimo.
4. Normalize e valide contra o contrato público antes de persistir/exportar.

O modelo não é fonte de verdade. Schema inválido, data impossível, moeda inválida, enum inválido, mistura de verbas/totais ou dado sem evidência deve ser normalizado de forma determinística, marcado com `?` quando aplicável ou gerar erro explícito — nunca valor inventado.

Centralize prompts, modelo, timeout, retries, fallback e telemetria no serviço OpenAI. Limite tentativas para controlar custo; registre somente job ID, estratégia, modelo, latência, status e tokens — nunca PII, PDF, prompt completo ou segredo. Testes devem mockar o cliente.

## Configuração e custo

- Chaves ficam no ambiente; `.env.example` tem apenas placeholders e `.env` não é versionado.
- Alterações de modelo, uma/duas passagens, rasterização ou retry exigem justificativa de precisão/custo e atualização FinOps quando aplicável.
- Cache por hash e extração local são aceitos se não ocultarem mudanças nem cruzarem dados de usuários.

## Docker e segurança

- Build reproduzível, dependências mínimas e usuário não-root quando viável.
- `docker compose up` sobe o sistema e recebe `OPENAI_API_KEY` pelo ambiente, sem segredo na imagem.
- Valide MIME, magic bytes `%PDF-`, limite configurável, PDF corrompido e concorrência.
- Documente em `SOLUCAO.md` retenção e limpeza de arquivos/transcrições. Não exponha PII em logs ou erros.
