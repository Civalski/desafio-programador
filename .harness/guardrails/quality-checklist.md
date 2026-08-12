# Checklist de Qualidade Pré-Submissão (AI Harness)

Antes de finalizar qualquer subtarefa ou submeter código no repositório, o agente de IA DEVE validar o checklist abaixo:

---

## 🔍 Checklist de Validação

- [ ] **Contrato HTTP Literal**: `POST /api/transcricoes`, `GET /api/transcricoes/:id`, `PUT /api/transcricoes/:id`, `GET /api/transcricoes/:id/planilha` e `GET /healthz` atendem exatamente os tipos de dados e payloads.
- [ ] **Honestidade de Incertezas**: Digitos ilegíveis utilizam `?` por caractere individual.
- [ ] **Moeda em String BR**: Nenhum valor monetário é retornado como float.
- [ ] **Holerite `fields` vs `bases`**: `Base INSS`, `Valor Líquido` e totais estão estritamente em `bases[]`.
- [ ] **Ordem dos Dias em Cartão de Ponto**: Mantida a ordem original do documento em `days[]`.
- [ ] **Visualização Lado a Lado**: A interface permite visualizar o PDF e a tabela editável simultaneamente.
- [ ] **Pipeline Único**: Cartão de Ponto e Holerite compartilham o mesmo fluxo de upload, fila e revisão.
- [ ] **Docker Compose**: `docker compose up` executa e sobe toda a aplicação sem erros.
- [ ] **Testes Essenciais por Branch**: A branch possui testes focados e fundamentais que validam a funcionalidade/integração implementada (sem cobertura artificial ou testes em excesso).
- [ ] **Documentação Obrigatória**: `SOLUCAO.md` e `PROCESSO.md` preenchidos com respostas fundamentadas às 3 perguntas obrigatórias.
