# Anti-Patterns Proibidos (Regras Estritas do AI Harness)

Os seguintes comportamentos e padrÃµes de cÃ³digo sÃ£o **estritamente proibidos** neste projeto. A presenÃ§a de qualquer um destes anti-patterns resultarÃ¡ em falha imediata nos testes ou nota zero no critÃ©rio correspondente.

---

## â›” 1. Incerteza e Dados
- âŒ **Inventar Caracteres**: Substituir um dÃ­gito apagado por uma estimativa ou chute.
- âŒ **Marcar Linha Inteira como Incerta**: Usar flags de incerteza no nÃ­vel de linha em vez de marcar o caractere exato como `?`.
- âŒ **Descartar Registros Duvidosos**: Omitir uma linha inteira do documento porque um valor estava ilegÃ­vel.

---

## â›” 2. Formatos de Dados e Tipografia
- âŒ **Converter Dinheiro para Float**: Converter `"2.389,77"` para `2389.77`.
- âŒ **Descartar os Valores Originais**: Omitir `date_raw` ou `time_raw` da saÃ­da JSON.
- âŒ **Misturar `fields` e `bases` no Holerite**: Inserir `Base INSS`, `Total Vencimentos` ou `Valor LÃ­quido` no array `fields`.
- âŒ **Produzir Datas ImpossÃ­veis**: Gerar datas como `38/07` ou mÃªs `13`.

---

## â›” 3. Arquitetura e HTTP
- âŒ **Duplicar a AplicaÃ§Ã£o**: Criar dois repositÃ³rios, dois servidores ou dois pipelines de upload separados para CartÃ£o de Ponto e Holerite.
- âŒ **Processar OCR dentro da RequisiÃ§Ã£o HTTP**: Executar OCR de forma sÃ­ncrona dentro da requisiÃ§Ã£o `POST /api/transcricoes`.
- âŒ **Divergir do Contrato da API**: Alterar nomes de endpoints, alterar chaves de JSON ou utilizar cÃ³digos HTTP diferentes dos especificados.

---

## â›” 4. ExtraÃ§Ã£o e OCR
- âŒ **Usar Coordenadas FÃ­sicas EsquemÃ¡ticas Fixas sem Fallback**: Fixar posiÃ§Ãµes x/y absolutas que quebram com variaÃ§Ãµes mÃ­nimas de layout.
- âŒ **Assumir que Todo PDF tem Camada de Texto**: Tratar retornos vazios do parser de PDF como documento em branco, sem fazer fallback para OCR.
- âŒ **Reordenar Linhas por Data**: Reordenar a lista `days[]` cronologicamente em vez de respeitar a ordem impressa no documento.


