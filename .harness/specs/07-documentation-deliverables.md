# Especificação Modular 07: Entregáveis e Documentação (`SOLUCAO.md` e `PROCESSO.md`)

Este módulo especifica o formato, conteúdo e perguntas obrigatórias que DEVEM ser respondidas nos arquivos de documentação `SOLUCAO.md` e `PROCESSO.md`, refletindo o padrão de projeto Open Source e integração com a API do Gemini.

---

## 📘 1. `SOLUCAO.md`

Arquivo focado em como rodar o projeto, arquitetura adotada e decisões de engenharia de nível de produção Open Source:

### Seções Obrigatórias:
1. **Como Executar**: Instruções claras de execução com `docker compose up` e localmente, incluindo a configuração da variável de ambiente `GEMINI_API_KEY`.
2. **Arquitetura de Produção Open Source**: Tecnologias utilizadas, fluxo de pipeline assíncrono e integração com a API do Gemini para extração via IA.
3. **Decisões de Engenharia & Trade-offs**: Justificativa de escolhas de bibliotecas, manutenibilidade do código e suporte a múltiplos layouts.
4. **Política de Retenção de Dados**: Explicação de onde e por quanto tempo os PDFs enviados e transcrições ficam armazenados.
5. **O que ficou de fora**: Se algum escopo foi cortado sob o prazo de 14h, listar o quê e o porquê.

---

## 🧠 2. `PROCESSO.md`

Arquivo focado no processo de desenvolvimento com Agentes de IA e honestidade sobre o trabalho realizado.

### Seções Obrigatórias:

1. **Uso de Ferramentas de IA**:
   - Quais ferramentas de IA foram utilizadas (ex: Gemini, Claude Code, Cursor, Copilot) e para quais etapas.

2. **Falhas e Correções do Agente**:
   - Registrar 2 ou 3 momentos específicos em que o agente cometeu erros, alucinou ou tomou um caminho incorreto, e como você identificou e corrigiu o problema.

3. **Reescritas Manuais**:
   - O que foi reescrito à mão e por qual motivo.

4. **Respostas Obrigatórias às 3 Perguntas do Desafio**:
   - **Pergunta 1**: Cite 3 decisões em que havia mais de uma resposta razoável. Por que escolheu essa?
   - **Pergunta 2**: O que na sua solução quebra primeiro em produção?
   - **Pergunta 3**: Onde você não confia no que entregou?

> [!IMPORTANT]
> **Avaliação de `PROCESSO.md`**:
> Respostas vagas ou genéricas em `PROCESSO.md` prejudicam significativamente a nota. Transparência sobre fragilidades e decisões conscientemente tomadas contam pontos a favor!
