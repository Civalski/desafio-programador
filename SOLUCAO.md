# Solução — Quick Filler

Aplicação web para transcrever holerites em PDF, permitir a revisão humana e exportar o resultado.

## Stack

| Camada | Tecnologia | Papel no projeto |
| --- | --- | --- |
| Runtime | Node.js 22 + JavaScript (ESM) | Servidor e pipeline de processamento. |
| API | Fastify 5 | API HTTP, upload multipart, arquivos estáticos e CORS. |
| Interface | React 19 + Vite 8 | Interface de upload, acompanhamento, revisão e download. |
| IA | OpenAI SDK | Extração estruturada e Vision para páginas sem camada de texto. |
| PDF | `pdf.js-extract`, `pdf-to-img`, `pdfjs-dist` e `@napi-rs/canvas` | Leitura de texto, análise de densidade e rasterização de páginas escaneadas. |
| Exportação | ExcelJS | Geração de XLSX; CSV e JSON são gerados pelo servidor. |
| Estado local | SQLite em arquivo | Armazena jobs e transcrições durante o desenvolvimento. |
| Empacotamento | Docker / Docker Compose | Ambiente reproduzível com Node 22 e bibliotecas do sistema para PDF/imagens. |
| Hospedagem | Vercel | Build do frontend e função HTTP em produção. |
| Testes | `node:test` | Testes de API, extração, normalização, segmentação e exportação. |

As dependências foram revisadas para a entrega. A biblioteca `canvas` foi removida por não haver uso direto; o projeto usa `@napi-rs/canvas`, necessário para a rasterização com `pdfjs-dist`. A integração de IA ativa do repositório é somente a OpenAI.

## Como executar

Pré-requisito: Node.js 22 ou superior. Para processar PDFs escaneados com IA, defina `OPENAI_API_KEY` no ambiente. PDFs com camada de texto possuem fallback local quando a chave não está disponível, dentro das limitações descritas abaixo.

```bash
npm install
$env:OPENAI_API_KEY = "sua_chave" # PowerShell
npm run dev
```

A interface fica disponível no endereço exibido pelo Vite e a API local em `http://localhost:3000`.

Também é possível iniciar o ambiente inteiro com Docker:

```bash
$env:OPENAI_API_KEY = "sua_chave" # PowerShell
docker compose up --build
```

O serviço estará em `http://localhost:3000`. A chave não é gravada na imagem nem versionada; em produção ela deve ser configurada exclusivamente pelo provedor de hospedagem.

## Arquitetura e fluxo

```text
PDF → validação de upload → job assíncrono → extração/normalização → revisão → exportação
                              │
              texto do PDF ──┴── página escaneada
                  extração local     rasterização + OpenAI Vision
```

1. A API valida o arquivo e cria um job, retornando `202 Accepted` imediatamente.
2. O processamento ocorre em segundo plano. A interface consulta o status e apresenta o progresso.
3. A camada de texto do PDF é usada quando disponível. Para páginas escaneadas, a página é rasterizada e enviada à OpenAI com capacidade visual.
4. A resposta do modelo não é aceita como fonte de verdade: normalizadores validam estrutura, mês, datas, moeda e a separação entre `fields` e `bases`. Dado ilegível deve permanecer explícito como `?`, sem inferência.
5. A pessoa usuária revisa a transcrição ao lado do PDF. O resultado corrigido alimenta os downloads XLSX, CSV ou JSON.

## Decisões e trade-offs

- **Escopo focado em holerites.** A API, a interface e a exportação foram reduzidas ao fluxo de folha de pagamento para priorizar precisão e revisão auditável.
- **OpenAI isolada em um serviço.** Prompts, seleção de modelo, tentativas e fallback ficam fora das rotas e da UI, mantendo a integração substituível e testável com mocks.
- **Estratégia adaptativa por página.** A densidade de texto orienta o número de chamadas: páginas simples podem usar uma passagem; páginas densas podem ser divididas para reduzir omissões. O impacto esperado está documentado em `FINOPS.md`.
- **Preservação do dado impresso.** Valores monetários permanecem strings brasileiras e os campos `*_raw` são mantidos para auditoria. É preferível sinalizar incerteza a produzir um valor aparentemente correto.

## Privacidade, retenção e operação

Os PDFs são mantidos em diretório temporário somente durante o processamento e removidos ao término. As transcrições locais expiram na inicialização depois de 24 horas (ajustável por `TRANSCRIPTION_RETENTION_HOURS`). Logs devem conter apenas identificadores técnicos e eventos operacionais, nunca conteúdo do documento, PII, prompts ou chaves.

No ambiente de produção, a publicação é feita pela integração Git da branch `main` e requer persistência remota. Desenvolvimento é local e não compartilha segredos nem estado com produção.

## Testes

```bash
npm test
npm run build
```

Os testes focam no que protege o contrato da entrega: normalização e validações de domínio, segmentação de PDFs densos, exportação, extração com mocks e endpoints da API. As chamadas da OpenAI são mockadas; a suíte não depende de chave ou rede.

## Limitações e próximos passos

- A qualidade da extração depende da legibilidade do PDF e da disponibilidade da OpenAI para documentos escaneados.
- O armazenamento local atende ao desenvolvimento; a operação em produção requer persistência remota configurada.
- Uma evolução prioritária é persistir resultados por página, com retries observáveis e retomada de jobs longos.
- Telemetria de modelo, tokens, latência e estratégia por página permitiria medir custo e precisão com dados reais.
