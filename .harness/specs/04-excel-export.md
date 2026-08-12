# Especificação Modular 04: Geração de Planilhas e Destaques Visuais

Este módulo especifica as regras exatas de transformação do JSON extraído em planilhas Excel (`.xlsx`), CSV e JSON, bem como o esquema obrigatório de estilização de cores e destaques de linha.

---

## 🎨 Estilização Padrão de Cabeçalhos (Excel)

Em ambas as planilhas (Cartão de Ponto e Holerite):
- **Texto**: Negrito na cor **Branca** (`#FFFFFF`).
- **Fundo da Célula**: Cor azul escuro **`#173772`**.

---

## 📅 1. Planilha de Cartão de Ponto

### Estrutura de Colunas:
- Coluna 1: `Data`
- Coluna 2: `Entrada 1`
- Coluna 3: `Saída 1`
- Coluna 4: `Entrada 2`
- Coluna 5: `Saída 2`
- ... Colunas alternadas `Entrada N` / `Saída N` suficientes para cobrir o dia com a maior quantidade de batidas do documento.

### Estrutura de Linhas:
- Uma linha por dia, **exatamente na ordem do documento original**.

---

## 🧾 2. Planilha de Holerite (Transposição de Matriz)

### Estrutura de Colunas:
- Colunas Fixas iniciais: `Pág.`, `Mês`, `Ano`
- Colunas Dinâmicas de Verbas: Formadas pela **união de todas as descrições (`label`) que aparecem em `fields[]`**, na ordem exata de sua primeira aparição no documento.

### Estrutura de Linhas:
- Uma linha por página do documento.
- Nas células dinâmicas: O valor daquela verba naquela página (ex: `"2.389,77"`).
- Se a verba não existir naquela página específica: A célula fica **vazia** (`""`).

---

## 🎨 3. Regras de Preenchimento e Cores de Alerta (Linha Inteira)

As linhas da planilha e as linhas da tabela de revisão DEVEM seguir o padrão de cores abaixo:

| Situação de Alerta | Cor de Preenchimento (Hex) | Detalhe Extra |
|---|---|---|
| **Aviso Amarelo**: Batidas ímpares, página vazia ou algum `?` na linha | **`#FFF3CD`** (Amarelo claro) | Nenhum |
| **Aviso Vermelho**: Data não sequencial ou Mês não sequencial | **`#F8D7DA`** (Vermelho claro) | Borda esquerda na 1ª célula: **`#DC3545`** |

> [!IMPORTANT]
> **Regra de Precedência de Cores**:
> Quando um mesmo dia ou página possuir ambos os alertas (ex: um `?` E uma data não sequencial), o alerta **VERMELHO GANHA** (`#F8D7DA` com borda `#DC3545`).

---

## 💾 Formatadores de Exportação
1. `.xlsx`: Gerado via biblioteca nativa de planilhas (ex: `exceljs`, `openpyxl`, etc.) aplicando estilos de borda, alinhamento e cores hex.
2. `.csv`: Dados delimitados por vírgula ou ponto-e-vírgula (valores vazios mantidos).
3. `.json`: Estrutura JSON com as correções aplicadas.
