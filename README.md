# Quick Filler — Folha de Pagamento

Aplicação web para extrair dados de holerites em PDF, revisar a transcrição ao lado do documento e exportar uma planilha corrigida.

## Arquitetura

```mermaid
flowchart LR
    U[Usuário] --> UI[React + Vite\nInterface de revisão]
    UI -->|upload, consulta e edição| API[Fastify API\nVercel]
    API -->|cria job e salva PDF| STATE[State Worker\nCloudflare Workers]
    STATE --> D1[(Cloudflare D1\njobs e resultados por página)]
    STATE --> R2[(Cloudflare R2\nPDFs originais)]
    API -->|processamento assíncrono| PIPE[Pipeline de extração]
    PIPE -->|PDF com texto| LOCAL[Extrator local\nsegmentação e normalização]
    PIPE -->|PDF escaneado ou Vision| AI[OpenAI API]
    LOCAL --> STATE
    AI --> STATE
    STATE -->|status e resultado| API
    API -->|polling e exportação XLSX/CSV/JSON| UI
    CRON[Worker Cron\ndiário] -->|remove dados expirados| STATE
```

## Fluxo

`enviar holerite → processar em segundo plano → revisar → baixar XLSX, CSV ou JSON`

O envio cria um job assíncrono e retorna `202 Accepted`. A extração usa a camada de texto do PDF quando disponível e OpenAI Vision em páginas escaneadas. Antes de persistir, o resultado é normalizado para preservar valores monetários como strings brasileiras e separar verbas (`fields`) de bases e totais (`bases`).

## Executar localmente

```bash
npm install
$env:OPENAI_API_KEY = "sua_chave"
npm run dev
```

Ou com Docker:

```bash
$env:OPENAI_API_KEY = "sua_chave"
docker compose up --build
```

## API

- `POST /api/transcricoes` — recebe `arquivo` (PDF) e `tipo=holerite`.
- `GET /api/transcricoes/:id` — consulta o job.
- `PUT /api/transcricoes/:id` — salva correções.
- `GET /api/transcricoes/:id/planilha?formato=xlsx|csv|json` — baixa a exportação.
- `GET /healthz` — healthcheck.

Mais detalhes de stack, segurança, decisões e limitações estão em [SOLUCAO.md](SOLUCAO.md). O custo e as estratégias de extração estão em [FINOPS.md](FINOPS.md).
