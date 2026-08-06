# Instruções para o Candidato

Leia o [`README.md`](README.md) primeiro — ele define o que construir. Este arquivo trata de **como** trabalhar e **como avaliamos**.

## Começando

1. Faça um fork deste repositório
2. Os PDFs de exemplo estão em `exemplos/`
3. Construa sua solução na linguagem que preferir
4. Publique a aplicação e envie o link do repositório + a URL

Organize o projeto como fizer sentido para você. Não temos estrutura de pastas preferida — temos o contrato de API e o formato de saída, ambos no `README.md`.

## Orçamento de tempo

**~8 horas.** Uma sugestão de divisão, só para calibrar:

| Etapa | Tempo |
|---|---|
| Extração do PDF | ~3h |
| API + processamento assíncrono | ~1h30 |
| Interface de revisão | ~2h |
| Docker + deploy | ~1h |
| `SOLUCAO.md` + `PROCESSO.md` | ~30min |

Se a extração consumir tudo, **pare e entregue o resto**. Uma aplicação completa que lê 70% das batidas vale mais que um parser perfeito sem interface, sem deploy e sem documentação. A recíproca também vale: uma casca bonita sem extração confiável não passa.

## Pesos da avaliação

| Critério | Peso | Como medimos |
|---|---|---|
| **Precisão da extração** | 30% | Script automático envia PDFs que você nunca viu para sua URL e compara `value` com o gabarito |
| **Honestidade dos dados** | 15% | Os `?` estão onde deveriam estar? Chuta dígito? Marca de incerto o que leu bem? |
| **O ciclo completo funciona** | 20% | Enviar → acompanhar → corrigir → baixar. A correção chega na planilha? |
| **Arquitetura e operação** | 15% | `docker compose up` funciona? A app sobrevive a um documento demorado? Config por env? |
| **Segurança e privacidade** | 10% | Validação de upload, limites, retenção, PII em log |
| **Código e decisões** | 10% | `SOLUCAO.md`, `PROCESSO.md`, legibilidade, testes onde importam |

Repare no que **não** está na tabela: quantidade de código, número de testes, tamanho do README. Nada disso soma pontos sozinho.

### Sobre "Honestidade dos dados"

É o critério que mais gente subestima, então vale ser explícito.

Nosso script compara batida a batida. Um dígito marcado como `?` custa bem menos que um dígito errado com cara de certo. Mas encher a saída de `?` para se proteger também não funciona: se você diz que não leu nada, você não transcreveu nada.

O que queremos ver é **calibração** — você sabe onde sua solução é forte e onde é frágil, e a saída reflete isso.

## Testes

Escreva os testes que te deram confiança para entregar, e só esses. Em `SOLUCAO.md`, diga em uma linha **por que escolheu esses casos**.

Cobertura alta não impressiona ninguém em 2026 — gerar 200 testes é barato. Escolher os 6 que pegam os erros que importam, não.

## Erros comuns

Coisas que já vimos derrubar entregas boas:

- **Processar dentro do request HTTP.** Funciona local e quebra em produção, quando o proxy da plataforma corta a conexão antes de a extração terminar. Pense em como o cliente descobre que o trabalho acabou.
- **Ordenar as linhas por data.** A saída segue a ordem do documento, página por página, de cima para baixo. Ordenar esconde exatamente o sinal que a marcação de data não sequencial existe para revelar.
- **Coordenadas fixas.** Amarrar a leitura a posições x/y absolutas quebra na primeira variação de layout — inclusive entre páginas do mesmo documento. Prefira localizar as colunas a partir do cabeçalho, e use posição fixa só como fallback.
- **Perder linhas em silêncio.** Se o período vai de 01 a 31 e sua saída tem 27 dias, 4 sumiram — quase sempre porque um filtro os descartou, não porque o documento não os tinha. Dias sem batida (`punches: []`) são linhas válidas e continuam na saída. Confira a continuidade das datas antes de entregar.
- **Descartar o valor original.** `time_raw` e `date_raw` guardam o que estava impresso. Se você só devolve o normalizado, ninguém consegue auditar de onde veio o erro.
- **Ajustar o código ao PDF de exemplo.** Vamos rodar sua aplicação contra documentos que você não viu. Qualquer valor específico dos exemplos gravado no código aparece na hora.
- **Deploy que não sobe.** Teste a URL numa janela anônima antes de mandar.

## Perguntas frequentes

**Posso usar bibliotecas de terceiros?**
Sim, quaisquer bibliotecas públicas.

**Posso usar Claude Code, Cursor, Copilot, ChatGPT?**
Sim, e queremos saber como. Veja a seção sobre uso de IA no `README.md`.

**Preciso implementar OCR?**
Não. Os exemplos são PDFs com camada de texto. OCR é bônus.

**Preciso guardar as transcrições em banco?**
Só se você quiser. Precisa funcionar entre o envio e o download, e a política de retenção precisa estar escrita — o resto é decisão sua.

**Posso mudar o formato do JSON?**
Não. É o formato que roda em produção aqui, e é ele que permite avaliar todo mundo com o mesmo script. Se achar que tem um defeito, siga-o mesmo assim e escreva em `SOLUCAO.md` o que mudaria — essa resposta conta a favor.

**Como sei quantas colunas `Entrada N` / `Saída N` a planilha tem?**
Pelo dia com mais batidas do documento. Dias com menos batidas deixam as colunas finais vazias.

**E se um dia do documento não fizer sentido?**
Aí você tem uma decisão a tomar. Tome, documente em `SOLUCAO.md`, e faça a interface mostrar o problema em vez de escondê-lo. Não existe uma única resposta certa — existe resposta justificada.

**Onde eu publico?**
Onde quiser, contanto que a URL abra. Free tier serve. Se a aplicação dorme por inatividade, sem problema.

**O que acontece depois?**
Quem avançar faz uma sessão de ~40 minutos, ao vivo, estendendo a própria solução para um layout novo, com agente liberado. Por isso vale entender de verdade o que você entregou.

---

**Sucesso no desafio! 🎯**
