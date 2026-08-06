# Desafio Técnico — Quick Filler

## Contexto

A Quick Filler transcreve documentos trabalhistas em PDF — cartões de ponto e holerites — para planilhas estruturadas. Na prática isso significa lidar com centenas de layouts diferentes, documentos escaneados, OCR imperfeito e a exigência de que **um número errado nunca passe despercebido**.

Este desafio é uma versão reduzida do nosso produto.

## O que você vai construir

Uma aplicação web publicada na internet que faz o caminho completo:

```
enviar PDF  →  processar  →  revisar a transcrição  →  baixar a planilha
```

Exatamente o fluxo do produto real:

1. **Envio** — o usuário escolhe um PDF de cartão de ponto e envia
2. **Processamento** — leva tempo; a interface acompanha até terminar
3. **Revisão** — a transcrição aparece numa tabela editável, ao lado do PDF, com os problemas destacados
4. **Download** — a planilha sai com os dados já corrigidos

> Escopo: apenas cartão de ponto. Holerite ficou de fora de propósito — seria o mesmo exercício duas vezes.

## Tempo esperado

**Cerca de 8 horas.** Não é prova de resistência, e não recompensamos volume de código.

Se estiver estourando, **corte escopo e escreva em `SOLUCAO.md` o que cortou e por quê**. Decidir o que sacrificar sob prazo é parte do que avaliamos — uma entrega menor e honesta vale mais que uma grande e frágil.

## O documento

Os PDFs de exemplo estão em `exemplos/`.

Um cartão de ponto tem uma linha por dia do período e, em cada linha, as batidas do funcionário em pares entrada/saída. **Mas nem todo dia é uma jornada normal**, e o que fazer com as exceções é parte do desafio — não vamos enumerá-las aqui.

Duas regras não negociáveis:

- **Nunca invente um valor.** Se um dígito não deu para ler, ele vai como `?` (veja abaixo). Um horário errado com aparência de certo é o pior resultado possível neste domínio — pior que um campo vazio.
- **Nunca produza uma data impossível.** `38/07` ou `62/11` significam erro de leitura, não um dia do calendário.

## Formato de saída

Este é o formato **real** que usamos em produção. Ele é obrigatório e literal — nosso script de correção envia PDFs que você nunca viu para a sua aplicação publicada e compara a resposta com o gabarito.

```jsonc
{
  "value": {
    "pages": [
      {
        "page": 1,
        "days": [
          {
            "date_raw": "21/05/2019",
            "punches": [
              { "kind": "IN",  "time_raw": "08:25", "time_hhmm": "08:25" },
              { "kind": "OUT", "time_raw": "18:25", "time_hhmm": "18:25" }
            ]
          },
          { "date_raw": "25/05/2019", "punches": [] }
        ]
      }
    ]
  }
}
```

| Campo | Significado |
|---|---|
| `pages[].page` | Número da página no PDF, começando em 1 |
| `days[]` | Um item por linha do documento, **na ordem em que aparecem** — não ordene por data |
| `date_raw` | A data exatamente como está impressa, sem normalizar |
| `punches[]` | As batidas na ordem do documento; lista vazia quando o dia não tem batida |
| `kind` | `IN` ou `OUT` |
| `time_raw` | O horário exatamente como está impresso |
| `time_hhmm` | O horário normalizado para `HH:MM`, 24 horas |

Repare no par `_raw` / normalizado: guardamos **o que o documento diz** e **o que você interpretou**, separadamente. Quando os dois divergem, dá para auditar. Não descarte o original.

### Incerteza

Quando um caractere não deu para ler com segurança, use `?` no lugar dele em `time_hhmm`:

```jsonc
{ "kind": "IN", "time_raw": "0?:25", "time_hhmm": "0?:25" }
```

Isso é melhor que descartar a batida e infinitamente melhor que chutar `08:25`. A incerteza é por caractere, não por linha — dizer "esse dígito eu não li" é uma informação útil, "essa linha inteira é duvidosa" quase nunca é.

### Avisos são derivados, não armazenados

Duas situações merecem destaque na tabela e na planilha:

- **Batidas ímpares** — o dia tem número ímpar de batidas, então falta uma entrada ou uma saída
- **Data não sequencial** — a data da linha quebra a sequência do documento, o que costuma indicar erro de leitura

Ambas saem **do próprio dado**, calculadas na hora de exibir. Não são campos no JSON. Um cartão com 31 linhas sequenciais e uma linha `38/07` no meio não precisa de flag — precisa de alguém que compare com as vizinhas.

## A planilha

Formato real do nosso export:

- Uma coluna `Data`, seguida de `Entrada 1`, `Saída 1`, `Entrada 2`, `Saída 2`, … alternando, com tantos pares quantos o dia com mais batidas exigir
- Uma linha por dia, na ordem do documento
- Cabeçalho em negrito branco sobre o fundo `#173772`

Destaques de linha:

| Situação | Preenchimento | Extra |
|---|---|---|
| Batidas ímpares, ou algum `?` na linha | `#FFF3CD` (amarelo) | — |
| Data não sequencial | `#F8D7DA` (vermelho) | Borda esquerda `#DC3545` na célula `Data` |

Quando as duas valem para a mesma linha, **vermelho ganha**.

Formatos aceitos para download: `.xlsx` (preferido), `.csv` ou `.json`.

## API HTTP

O contrato abaixo é obrigatório e literal — é por ele que avaliamos a precisão automaticamente, independente da linguagem que você escolher. Divergir dele significa nota zero em precisão, mesmo com a extração perfeita.

#### `POST /api/transcricoes`

`multipart/form-data`, campo do arquivo chamado `arquivo`.

```http
HTTP/1.1 202 Accepted
{ "id": "abc123" }
```

#### `GET /api/transcricoes/:id`

```http
HTTP/1.1 200 OK
{ "id": "abc123", "status": "concluido", "erro": null, "value": { "pages": [ ... ] } }
```

`status` é um de `processando`, `concluido`, `erro`. Enquanto for `processando`, `value` é `null`. Em `erro`, `erro` traz mensagem legível.

#### `PUT /api/transcricoes/:id`

Recebe o mesmo objeto `value`, com as correções feitas na interface, e substitui a transcrição.

#### `GET /api/transcricoes/:id/planilha`

Devolve a planilha já com as correções aplicadas. Aceita `?formato=xlsx|csv|json`.

#### `GET /healthz`

`200 OK` quando a aplicação está de pé.

## A interface

O que precisa existir:

- **Envio do PDF** com feedback de progresso — processar leva tempo, e a tela não pode parecer travada
- **Tabela editável** com a transcrição, uma linha por dia, colunas `Entrada N` / `Saída N`
- **Problemas destacados** — batidas ímpares e datas não sequenciais visualmente marcadas, com o motivo legível, seguindo as mesmas cores da planilha
- **PDF visível ao lado da tabela**, para conferir sem trocar de janela
- **Botão de download**, refletindo as edições

Não precisa de login nem de design elaborado. Precisa ser honesta sobre o que a máquina não conseguiu ler, e precisa deixar corrigir.

## Operação

- **`Dockerfile` + `docker-compose.yml`**: `docker compose up` sobe tudo. Este é o requisito duro.
- **Aplicação publicada**, com URL acessível. Qualquer plataforma gratuita serve, e não tem problema se ela dormir por inatividade — a URL é a demonstração, o `docker compose` é o que garante a avaliação.
- Configuração por variável de ambiente. Nenhum segredo no repositório.
- CI mínima (lint + testes) é diferencial.

## Segurança e privacidade

Você vai colocar na internet um endpoint público que recebe documento com nome, matrícula e jornada de pessoas reais:

- Limite de tamanho de upload
- Validação de que o arquivo é mesmo um PDF
- Comportamento definido para arquivo corrompido, PDF gigante e uploads simultâneos
- Política de retenção explícita em `SOLUCAO.md`: o que guarda, onde, por quanto tempo
- Sem PII nos logs

## Tecnologia

**Linguagem e bibliotecas livres.** Nos interessam fundamentos e raciocínio, não uma stack específica. A única coisa fechada é o contrato HTTP.

## Sobre uso de IA

**Use os agentes e assistentes que quiser.** É assim que trabalhamos aqui, e fingir o contrário não ajudaria ninguém.

Em compensação, queremos ver como você conduz. Entregue um `PROCESSO.md` com:

- Que ferramentas usou e para quê
- Dois ou três pontos em que o agente errou ou pegou o caminho errado, e como você percebeu
- O que reescreveu à mão, e por quê

E responda, no mesmo arquivo:

1. Cite 3 decisões em que havia mais de uma resposta razoável. Por que escolheu essa?
2. O que na sua solução quebra primeiro em produção?
3. Onde você não confia no que entregou?

Essas respostas pesam. Código impecável com `PROCESSO.md` vago é sinal ruim.

## Bônus

Nenhum é necessário para uma entrega forte. Só faça se sobrar tempo.

- **Rastreabilidade visual** — clicar numa célula da tabela e ver destacado, no PDF, o trecho exato de onde aquele valor saiu. É a funcionalidade central do nosso produto, e exige carregar as coordenadas do texto por todo o pipeline.
- **PDF escaneado** — os exemplos têm camada de texto. Suportar documento escaneado, via OCR, é um extra relevante: é a realidade da maior parte do que recebemos.
- **Layout desconhecido** — o que sua aplicação faz ao receber um cartão de ponto de um layout que ela não conhece? Responder "não sei ler este documento" é melhor que devolver lixo.

## Entregáveis

1. Link do repositório
2. URL da aplicação publicada
3. `SOLUCAO.md` — como rodar, decisões técnicas, o que ficou de fora
4. `PROCESSO.md` — conforme a seção sobre uso de IA
5. A planilha gerada a partir dos PDFs em `exemplos/`

## Como vamos avaliar

Pesos e detalhes em [`INSTRUCOES.md`](INSTRUCOES.md).

Depois da entrega, quem avançar faz uma sessão de ~40 minutos com a gente, ao vivo, estendendo a própria solução para um layout novo — com agente liberado.

## Dúvidas

Fale com o recrutador responsável. Perguntar quando o enunciado está ambíguo é comportamento desejável, não sinal de fraqueza.

---

**Boa sorte! 🚀**
