# Especificação Modular 08: Rubrica de Avaliação e Pesos

Este módulo apresenta os critérios oficiais de avaliação do desafio e os pesos atribuídos a cada aspecto da entrega.

---

## 📊 Pesos Oficiais da Avaliação

| Critério | Peso | O que é Avaliado |
|---|---|---|
| **Precisão da Extração** | **30%** | Porcentagem da transcrição correta nos dois tipos de documento (ambos pesam igual). |
| **Honestidade dos Dados** | **15%** | Calibração da incerteza (`?`). Uso correto de `?` onde ilegível, sem inventar caracteres ou marcar como incerto o que foi bem lido. |
| **O Ciclo Completo Funciona** | **20%** | Fluxo completo funcional: Enviar PDF → Acompanhar progresso → Corrigir na interface → Baixar planilha. As correções chegam na planilha exportada? |
| **Arquitetura e Operação** | **15%** | `docker compose up` funciona? Pipeline é compartilhado entre os 2 tipos? A aplicação sobrevive a um documento demorado sem travar? |
| **Segurança e Privacidade** | **10%** | Validação de upload, limites de arquivo, política de retenção, ausência de PII em logs. |
| **Código e Decisões** | **10%** | Qualidade de `SOLUCAO.md` e `PROCESSO.md`, legibilidade do código, testes automatizados onde importam. |

---

## ❌ Fatores que Não Somam Pontos Sozinhos
- Quantidade bruta de código.
- Alto número de testes sem relevância prática.
- Tamanho exaustivo do README.

---

## 🛑 Erros Fatais (Zero em Precisão / Arquitetura)

1. **Divergir do Contrato HTTP**: Mudar nomes de campos ou endpoints da API HTTP descritos em `03-api-contracts.md`.
2. **Duplicar Aplicações**: Criar duas apps/pipelines separados para Cartão de Ponto e Holerite.
3. **Converter Valores Monetários para Float**: Perder o formato `"2.389,77"` e usar `2389.77`.
4. **Misturar `fields` e `bases` em Holerite**: Inserir `Base INSS` ou `Valor Líquido` no array `fields`.
5. **Processar OCR dentro da Requisição HTTP**: Executar extração síncrona dentro da requisição `POST /api/transcricoes`.
6. **Chutar Valores Ilegíveis**: Inventar dados em vez de marcar com `?`.
