# Processo de desenvolvimento e uso de IA

## Organização do trabalho com IA

Criei um harness de IA para auxiliar o agente a desenvolver o código com base na documentação. Modularizei as exigências em arquivos para evitar a leitura desnecessária de muita informação e o consumo de tokens, e padronizei as instruções para serem chamadas quando o prompt exigisse.

Antes da primeira linha de código ser escrita, foquei em não gastar com ferramentas. Cerca de 90% do projeto foi feito usando o Antigravity, com modelos como Gemini 5.6 Flash e 3.1 Pro. Tive também um prompt com o Claude Sonnet 4.6 gratuito que me salvou em um problema, mas a cota se esgotou já no primeiro prompt: a implementação de um plano de orquestração de prompts.

No final do projeto, o Gemini perdeu completamente a precisão: ainda funciona, mas passou a alucinar excessivamente. Migrei para finalizar usando o plano pago do Codex, com GPT-5.6 Terra e Lua no nível mínimo de raciocínio.

## Evolução da extração

Alguns documentos, como o `payroll-01.pdf`, eram muito densos em informação, com vários holerites em uma única página. Isso exigia muito de cada prompt, então foi necessário quebrar o processamento em partes menores: primeiro, extrair as colunas; depois, usar um prompt para definir a estrutura e validar os formatos; e outro para preencher os dados da planilha.

O primeiro resultado não foi muito preciso. Então criei um script determinístico que lê, com regex, quantos caracteres existem por página. Com esse dado, consigo estimar quantos prompts serão necessários para cada página conforme sua densidade, evitando desperdiçar tokens com arquivos menores.

Para ler imagens, é usado um OCR simples apenas para identificar uma média de caracteres e definir uma divisão mais adequada dos prompts para o OpenAI Vision.

## Ferramentas avaliadas

Eu gostaria de ter usado o Google Document AI, uma API do GCP especializada na leitura de dados desestruturados, mas o GCP não estava aceitando meu cartão e não consegui usar o serviço. Na AWS, também não tenho créditos para usar o Textract; na Azure, o free tier é limitado a duas páginas.

Encontrei uma API simples de configurar chamada Mindee, que eu não conhecia. Dadas as opções, optei por ela porque oferecia um free tier de 200 páginas. Testei, mas a precisão deixou a desejar, então descartei essa opção.

Depois tentei usar a API do Gemini, que antigamente tinha um free tier alto, mas, após 20 requisições, o limite diário acabou. Nesse momento, lembrei que talvez ainda tivesse créditos na API da OpenAI e resolvi usá-la.

## Falhas e aprendizados

Houve algumas falhas do agente. Não me recordo completamente de todas, mas incluo erros relacionados a documentação atualizada que não foi consultada — eu estava testando um ambiente novo, sem os MCPs que costumo utilizar, como o Context7.

Também houve sugestões ruins, como usar o Mindee mesmo depois de eu explicar o cenário; não tenho nada contra o Mindee, mas ele não servia para este caso específico. Foram sugeridos ainda modelos inadequados, como GPT-4o. Enfim, houve bastante erro do agente, embora eu não me recorde de todos agora.

O principal erro do projeto foi perder tempo com ferramentas que não funcionaram. Ao atingir as 14 horas previstas para o desafio, não deu tempo de fazer o timecard.

Também não concluí a implementação do banco de dados dentro desse prazo. A persistência foi iniciada, mas a configuração e a validação completas do banco para produção ficaram como pendência para que a entrega fosse realizada dentro das 14 horas previstas. (embora isso fosse uma feature bonus, iria aumenta muito a confiança em relação a falhas que poderiam ocorrer durante o processamento dos arquivos)

Não estou satisfeito com o resultado final, pois identifico pontos de melhoria na implementação e na confiabilidade do fluxo em produção. Ainda assim, optei por entregar o estado atual quando o tempo previsto se esgotou, em vez de estender o prazo de 14 horas do desafio.
