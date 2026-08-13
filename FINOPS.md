# FinOps — processamento de documentos

**Atualizado em:** 12/08/2026  
**Escopo:** custo estimado de IA para extrair dados de holerites no Quick.

## Resumo

- O escopo atual cobre exclusivamente **holerites**.
- O modelo prioritário é **`gpt-5.6-luna`**. `gpt-4o` e `gpt-4o-mini` são usados somente se o modelo principal falhar ou sofrer limitação.
- O PDF é analisado localmente e cada página segue uma estratégia conforme a densidade do conteúdo.
- Os valores abaixo representam volume de chamadas, não custo: o custo real deve ser acompanhado pelos tokens retornados pela API.

| Cenário (por página) | Estratégia | Chamadas estimadas |
|---|---|---:|
| Holerite denso | 2 chamadas | 2 a 3 |
| Holerite médio | 1 chamada | 1 |
| Holerite simples | 1 chamada | 1 |
| Holerite escaneado | Vision, 1 chamada | 1 |

O custo principal depende da tabela de preços do `gpt-5.6-luna` no provedor configurado. Não há preço público confirmado para esse identificador no projeto, portanto a documentação não deve estimá-lo a partir dos preços do GPT-4o. Os modelos de fallback só geram custo quando acionados.

## Como o custo é definido

1. O pré-processamento local mede o conteúdo da página, sem extrair dados e sem custo de IA.
2. Páginas simples usam uma chamada; páginas densas podem usar duas.
3. PDFs escaneados usam visão. Fichas financeiras usam uma chamada por mês/bloco.
4. Em erro, o sistema pode tentar outro modelo, elevando o custo.

## Principais riscos

- Uma chamada extra para validar totais em páginas densas.
- Retentativas e fallback de modelo.
- Imagens em alta resolução: são o principal fator de custo no modo Vision.
- PDFs muito densos ou fichas com muitos meses.

## Ações prioritárias

1. Registrar modelo, tokens de entrada/saída e custo por chamada.
2. Usar cache por hash do arquivo para evitar reprocessamento.
3. Direcionar documentos simples ao modelo mais econômico após validar a qualidade.
4. Avaliar reduzir a resolução de rasterização de PDFs escaneados sem comprometer a extração.
5. Persistir resultados por página para retomar processamentos que falharem.

> Com a telemetria, o custo do `gpt-5.6-luna` e dos fallbacks poderá ser calculado com dados reais.
