# Processo de desenvolvimento e uso de IA

## Uso de IA

Assistentes de IA foram usados como apoio para planejar a arquitetura, investigar falhas, revisar código, estruturar prompts e acelerar ciclos de hipótese, implementação e teste. A decisão final, a validação dos resultados e a reescrita das partes críticas permaneceram manuais.

No produto, a única integração de IA é a API da OpenAI. Ela é usada para extrair dados estruturados de páginas complexas ou escaneadas; os resultados passam por normalização e validação determinística antes de serem persistidos ou exportados.

## Como o pipeline evoluiu

Documentos muito densos, como fichas financeiras com vários períodos na mesma página, não tiveram boa precisão quando enviados integralmente em uma única solicitação. O pipeline foi então dividido em etapas:

1. extrair a camada de texto e estimar a densidade de cada página;
2. segmentar páginas ou blocos mensais quando necessário;
3. solicitar dados estruturados ao modelo, preservando somente evidência do documento;
4. validar formato, competência, moeda e a separação entre verbas, bases e totais;
5. consolidar o resultado para revisão humana e exportação.

Páginas simples usam menos chamadas; páginas densas recebem processamento segmentado. Para documentos sem camada de texto, a rasterização fornece a imagem para o modo Vision. A estratégia busca equilibrar precisão e custo sem ocultar incertezas.

## Decisões tomadas

1. **JavaScript/Node em vez de uma stack dedicada a OCR.** A aplicação concentra integração, validação, revisão e exportação de holerites. Node permitiu manter frontend e backend no mesmo projeto e entregar o ciclo completo dentro do prazo.
2. **OpenAI como único provedor.** Centralizar a integração reduziu superfície operacional e evitou fluxos divergentes. A contrapartida é a dependência externa, tratada com fallback local quando há texto extraível e erro explícito quando não há evidência suficiente.
3. **Dados brutos junto aos normalizados.** Manter `date_raw` e `time_raw`, valores monetários em string BR e `?` para caracteres incertos torna a revisão auditável e impede que uma normalização esconda erro de leitura.

## Caminhos corrigidos

- A primeira estratégia de enviar páginas densas inteiras ao modelo causava omissões. A correção foi segmentar conforme a densidade e consolidar os blocos com validação.
- Tratar texto ausente como documento vazio falhava para PDFs escaneados. A correção foi detectar esse caso e usar rasterização com Vision, ou devolver um erro claro quando não for possível extrair com segurança.
- Respostas estruturalmente válidas ainda podiam misturar verbas, bases e totais. A correção foi reforçar a normalização determinística e os testes de contrato antes da persistência.

## Pontos que exigiram reescrita manual

As regras de normalização, validação e exportação foram revisadas manualmente porque são a fronteira de confiabilidade do produto: não podem inventar caracteres, converter moeda para ponto flutuante, produzir datas impossíveis ou misturar `fields` e `bases`. Os prompts também foram ajustados manualmente para solicitar somente evidência e sinalizar campos incertos.

## O que pode quebrar primeiro em produção

O principal risco é um job longo falhar depois de já processar parte do documento, especialmente quando depende de IA para páginas escaneadas. A melhoria prioritária é persistir resultados por página, com fila, retries limitados, telemetria e retomada a partir do último ponto válido.

Também há dependência da disponibilidade e dos limites da API da OpenAI. A aplicação deve manter erros observáveis e seguros, sem expor conteúdo do documento, prompts ou segredos.

## Onde não há confiança plena

Não há garantia de precisão absoluta em documentos de baixa qualidade, com OCR ruim ou layouts inéditos. Nesses casos, a solução deve preservar a incerteza por caractere e encaminhar o resultado para revisão humana, em vez de completar valores por inferência.
