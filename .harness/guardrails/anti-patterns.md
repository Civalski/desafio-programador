# Anti-Patterns Proibidos (Regras Estritas do AI Harness)

Os seguintes comportamentos e padrões de código são **estritamente proibidos** neste projeto. A presença de qualquer um destes anti-patterns resultará em falha imediata nos testes ou nota zero no critério correspondente.

---

## ⛔ 1. Incerteza e Dados
- ❌ **Inventar Caracteres**: Substituir um dígito apagado por uma estimativa ou chute.
- ❌ **Marcar Linha Inteira como Incerta**: Usar flags de incerteza no nível de linha em vez de marcar o caractere exato como `?`.
- ❌ **Descartar Registros Duvidosos**: Omitir uma linha inteira do documento porque um valor estava ilegível.

---

## ⛔ 2. Formatos de Dados e Tipografia
- ❌ **Converter Dinheiro para Float**: Converter `"2.389,77"` para `2389.77`.
- ❌ **Descartar os Valores Originais**: Omitir `date_raw` ou `time_raw` da saída JSON.
- ❌ **Misturar `fields` e `bases` no Holerite**: Inserir `Base INSS`, `Total Vencimentos` ou `Valor Líquido` no array `fields`.
- ❌ **Produzir Datas Impossíveis**: Gerar datas como `38/07` ou mês `13`.

---

## ⛔ 3. Arquitetura e HTTP
- ❌ **Duplicar a Aplicação**: Criar dois repositórios, dois servidores ou dois pipelines de upload separados para Cartão de Ponto e Holerite.
- ❌ **Processar OCR dentro da Requisição HTTP**: Executar OCR de forma síncrona dentro da requisição `POST /api/transcricoes`.
- ❌ **Divergir do Contrato da API**: Alterar nomes de endpoints, alterar chaves de JSON ou utilizar códigos HTTP diferentes dos especificados.

---

## ⛔ 4. Extração e OCR
- ❌ **Usar Coordenadas Físicas Esquemáticas Fixas sem Fallback**: Fixar posições x/y absolutas que quebram com variações mínimas de layout.
- ❌ **Assumir que Todo PDF tem Camada de Texto**: Tratar retornos vazios do parser de PDF como documento em branco, sem fazer fallback para OCR.
- ❌ **Reordenar Linhas por Data**: Reordenar a lista `days[]` cronologicamente em vez de respeitar a ordem impressa no documento.
