# AI Harness — Quick Filler

Este arquivo orienta agentes de código neste repositório. `README.md` define o produto; `INSTRUCOES.md` define avaliação e restrições; este arquivo define como trabalhar com precisão.

## Fluxo de trabalho

1. A cada solicitação do usuário, antes de responder, investigar ou editar, leia `.harness/INDEX.md` e apenas os módulos pertinentes. Para contrato e domínio, priorize `README.md`; para critérios, `INSTRUCOES.md`.
2. Antes de qualquer alteração de ambiente, deploy, persistência, API ou feature flag, leia também `.harness/specs/06-architecture-ops.md` e `.harness/guardrails/quality-checklist.md`.
3. Inspecione código, testes e configuração existentes antes de decidir. Não suponha arquivos, modelos, bibliotecas ou endpoints.
3. Preserve alterações não relacionadas. Não sobrescreva `.env`, PDFs de exemplo, saídas geradas ou código fora do escopo.
4. Faça mudanças coesas e valide com o teste/lint mais específico disponível. Ao concluir, informe o que foi efetivamente verificado.

## Precedência de contexto

Em conflitos, use: 1) contratos e regras do `README.md`; 2) `INSTRUCOES.md`; 3) `.harness/specs/`; 4) código e testes; 5) este guia. Não altere contratos públicos para acomodar decisões internas.

## Regras de domínio

## Separação obrigatória de ambientes

- Desenvolvimento é somente local: usa `.env.development`, `npm run dev`, armazenamento local e pode habilitar time-card.
- Produção é somente Vercel/Git na branch `main`: recebe variáveis pelo painel, requer persistência remota (`STATE_API_URL` e `STATE_API_TOKEN`) e mantém `ENABLE_TIME_CARD=false`.
- Nunca execute `vercel --prod` a partir de diretório local ou branch de feature. O build de produção deve falhar fora da branch `main`.
- Antes de publicar, execute testes, build e smoke test de payroll; não promova time-card sem solicitação explícita do usuário.

- Um único pipeline atende cartão de ponto e holerite: upload, job assíncrono, revisão, persistência e exportação são compartilhados; extratores/schemas são específicos.
- `POST /api/transcricoes` retorna `202` com `id`; OCR e IA nunca bloqueiam a requisição HTTP.
- Caractere ilegível é `?`; nunca invente, complete por inferência ou descarte registro parcialmente ilegível.
- Valores monetários são strings BR; não converta o dado de saída para `number`/`float`.
- Preserve `date_raw` e `time_raw`; não crie datas impossíveis ou mês fora de `01`–`12`.
- Preserve a ordem visual; dias sem batida e páginas vazias são registros válidos.
- Holerite: verbas em `fields[]`; bases, totais e líquido em `bases[]`.
- Valide PDF, tamanho e falhas previsíveis. Nunca registre PII, conteúdo do documento ou chaves.

## OpenAI — única integração de IA

- Use somente OpenAI. A chave é `OPENAI_API_KEY`; `OPENAI_SECRET_KEY` é apenas alias de compatibilidade se já aceito pelo código. Não introduza Mindee, Gemini ou outro provedor.
- A chave fica exclusivamente no ambiente. Nunca leia, mostre ou versione `.env`; `.env.example` contém apenas placeholder.
- Reutilize o serviço OpenAI existente, isolado de controllers e UI. Centralize prompts, seleção de modelo, timeout, retries, fallback e telemetria.
- Use a camada de texto do PDF quando útil; em página escaneada/sem texto, use Vision da OpenAI. Texto vazio não significa documento vazio.
- Solicite JSON estruturado, mas trate toda resposta do modelo como não confiável: normalize e valide schema, tipos, enums, datas, mês, moeda e `fields`/`bases` antes de persistir.
- Prompts devem pedir somente evidência do documento, preservar valores impressos e usar `?` para incerteza. Não peça raciocínio interno.
- Retries/fallbacks devem ser limitados e observáveis. Falha final resulta em `status: "erro"` seguro, sem PII, prompt ou segredo.
- Ao alterar modelo, custo, resolução, estratégia ou fallback, atualize o relatório FinOps/documentação relevante e inclua testes.

## Implementação, testes e entrega

- Separe HTTP, jobs, extração OpenAI, normalização de domínio e exportação. Dependências externas devem ser mockáveis.
- Não use coordenadas fixas sem fallback estrutural; não use mocks como resultado de produção.
- Toda alteração funcional precisa do menor conjunto de testes que cubra seu risco. Testes da OpenAI devem usar cliente mockado, sem rede ou chave real.
- Antes de concluir, consulte `.harness/guardrails/quality-checklist.md` e `anti-patterns.md`, execute verificações relevantes e atualize `SOLUCAO.md`, `PROCESSO.md` ou FinOps se a operação/custo/limitação mudar.

## Roteamento rápido

| Escopo | Contexto |
| --- | --- |
| Cartão de ponto | `.harness/specs/01-domain-cartao-ponto.md` |
| Holerite | `.harness/specs/02-domain-holerite.md` |
| API e jobs | `.harness/specs/03-api-contracts.md` |
| Exportação | `.harness/specs/04-excel-export.md` |
| Interface | `.harness/specs/05-frontend-ui.md` |
| OpenAI, Docker, segurança e operação | `.harness/specs/06-architecture-ops.md` |
| Documentação | `.harness/specs/07-documentation-deliverables.md` |
| Avaliação | `.harness/specs/08-evaluation-rubric.md` |
