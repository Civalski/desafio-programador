# Quick Filler — Folha de Pagamento

Aplicação web para extrair dados de holerites em PDF, revisar a transcrição ao lado do documento e exportar uma planilha corrigida.

## Produção

Aplicação publicada em: https://desafio-programador.vercel.app/

## Como a extração funciona

```mermaid
flowchart TD
    INPUT["PDF do holerite enviado pelo usuário"] --> VALIDATE["Validação do arquivo e criação do job"]
    VALIDATE --> INSPECT["Leitura local por página<br/>texto, densidade e segmentação"]

    INSPECT --> ROUTE{"O PDF tem<br/>camada de texto?"}
    ROUTE -->|Sim| TEXT["Texto estruturado da página"]
    ROUTE -->|Não| RASTER["Rasterização da página"]
    RASTER --> OCR["OCR local<br/>texto e nível de confiança"]
    OCR --> VISION["Imagem da página para Vision"]

    TEXT --> LOCAL["Pré-extração determinística<br/>linhas, códigos, valores e totais candidatos"]
    OCR --> LOCAL
    TEXT --> AGENTS
    VISION --> AGENTS

    subgraph AGENTS["Agentes de IA executados em paralelo"]
        ID["Agente de identificação<br/>colaborador e competência"]
        FIELDS["Agente de verbas<br/>proventos e descontos"]
        SUMMARY["Agente de rodapé<br/>bases, totais e referências"]
    end

    LOCAL --> MERGE["Reconciliação<br/>e normalização dos resultados"]
    ID --> MERGE
    FIELDS --> MERGE
    SUMMARY --> MERGE
    MERGE --> AUDIT["Auditoria de cobertura<br/>confere itens visíveis, totais e confiança do OCR"]
    AUDIT --> DECISION{"Há lacunas ou<br/>sinais de baixa confiança?"}
    DECISION -->|Sim| RECOVERY["Agente de auditoria<br/>recupera somente os itens pendentes"]
    RECOVERY --> MERGE
    DECISION -->|Não| OUTPUT["Resultado estruturado por página<br/>verbas, bases, totais e alertas"]
    OUTPUT --> REVIEW["Persistência, revisão humana e correções"]
    REVIEW --> EXPORT["Exportação em XLSX, CSV ou JSON"]
```

O roteamento é feito por página: PDFs com texto seguem para os agentes com a camada textual; PDFs escaneados passam por rasterização, OCR local e Vision. Os agentes especializados dividem a leitura em identificação, verbas e rodapé. Depois, uma auditoria compara o que foi extraído com os itens detectados localmente e aciona um agente de recuperação apenas quando necessário.

Em produção, a API retorna `202 Accepted` e conclui o processamento em segundo plano. Cada página extraída é persistida separadamente, permitindo acompanhar o progresso e retomar a execução sem reprocessar as páginas concluídas.

## Fluxo

`enviar holerite → processar em segundo plano → revisar → baixar XLSX, CSV ou JSON`

O envio cria um job assíncrono e retorna `202 Accepted`. Todo dado transcrito é produzido pela OpenAI: PDFs textuais enviam texto preparado e PDFs escaneados enviam imagens via Vision. O processamento local apenas mede densidade, segmenta e rasteriza para definir a estratégia e a quantidade de prompts. Sem OpenAI configurada ou disponível, o job falha explicitamente. Antes de persistir, o resultado é normalizado para preservar valores monetários como strings brasileiras e separar verbas (`fields`) de bases e totais (`bases`).

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
