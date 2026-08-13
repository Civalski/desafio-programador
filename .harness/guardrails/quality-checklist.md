# Checklist de Qualidade PrÃ©-SubmissÃ£o (AI Harness)

Antes de finalizar qualquer subtarefa ou submeter cÃ³digo no repositÃ³rio, o agente de IA DEVE validar o checklist abaixo:

---

## ðŸ” Checklist de ValidaÃ§Ã£o

- [ ] **Contrato HTTP Literal**: `POST /api/transcricoes`, `GET /api/transcricoes/:id`, `PUT /api/transcricoes/:id`, `GET /api/transcricoes/:id/planilha` e `GET /healthz` atendem exatamente os tipos de dados e payloads.
- [ ] **Honestidade de Incertezas**: Digitos ilegÃ­veis utilizam `?` por caractere individual.
- [ ] **Moeda em String BR**: Nenhum valor monetÃ¡rio Ã© retornado como float.
- [ ] **Holerite `fields` vs `bases`**: `Base INSS`, `Valor LÃ­quido` e totais estÃ£o estritamente em `bases[]`.
- [ ] **Ordem dos Dias em CartÃ£o de Ponto**: Mantida a ordem original do documento em `days[]`.
- [ ] **VisualizaÃ§Ã£o Lado a Lado**: A interface permite visualizar o PDF e a tabela editÃ¡vel simultaneamente.
- [ ] **Pipeline Ãšnico**: CartÃ£o de Ponto e Holerite compartilham o mesmo fluxo de upload, fila e revisÃ£o.
- [ ] **OpenAI Isolada e Segura**: Apenas OpenAI é usada; chave no ambiente e resposta normalizada/validada antes de persistir.
- [ ] **PDF Escaneado**: Texto ausente aciona Vision/OpenAI ou erro explícito, nunca transcrição vazia silenciosa.
- [ ] **Falhas de IA Seguras**: Timeout, rate limit e schema inválido não vazam PII/segredos e terminam em estado observável.
- [ ] **Docker Compose**: `docker compose up` executa e sobe toda a aplicaÃ§Ã£o sem erros.
- [ ] **Testes Essenciais por Branch**: A branch possui testes focados e fundamentais que validam a funcionalidade/integraÃ§Ã£o implementada (sem cobertura artificial ou testes em excesso).
- [ ] **DocumentaÃ§Ã£o ObrigatÃ³ria**: `SOLUCAO.md` e `PROCESSO.md` preenchidos com respostas fundamentadas Ã s 3 perguntas obrigatÃ³rias.


