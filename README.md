# Quick Filler — Folha de Pagamento

Aplicação web para extrair dados de holerites em PDF, revisar a transcrição ao lado do documento e exportar uma planilha corrigida.

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
