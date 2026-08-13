# Documentação dos testes

Os testes são executados com o test runner nativo do Node.js (`node --test`) e cobrem a extração, a normalização, a segmentação, a exportação e a API de holerites.

| Arquivo | O que valida |
| --- | --- |
| `api.test.js` | Verifica a rota de saúde, a edição de uma transcrição e a exportação em CSV. Também confirma que a API rejeita tipos de documento fora do escopo, incluindo cartão de ponto. |
| `density.test.js` | Testa o cálculo de densidade de texto e a escolha da estratégia de extração. Quando os arquivos de entrada estão disponíveis, avalia também a estratégia escolhida para cada PDF. |
| `exportPivot.test.js` | Garante que a exportação de holerite gera CSV no formato pivotado correto e que a geração de XLSX retorna nome de arquivo e conteúdo válidos. |
| `extraction.test.js` | Processa os quatro holerites de exemplo com o mock e confirma que o resultado segue o schema esperado: páginas, verbas (`fields`) e bases (`bases`). |
| `horizontalSplit.test.js` | Valida a identificação de holerites complexos, o corte horizontal em espaços vazios, a união sem duplicação de verbas e a preservação de referência, valor e bases após a divisão. |
| `normalizers.test.js` | Confirma que o normalizador separa verbas de bases/totais e trata corretamente competências consecutivas entre anos diferentes. |
| `payroll-01-benchmark.test.js` | Compara a extração de `holerite-1.pdf` com o gabarito auditado em `fixtures/payroll-01-audit.txt` e verifica que o benchmark produz nota e relatório por mês válidos. |
| `payrollCompetency.test.js` | Testa a união de páginas complementares da mesma competência e a opção de manter essas páginas separadas. |
| `payrollMultiMonth.test.js` | Confirma o alinhamento entre referência e valor, a correção de valores posicionados na coluna errada e o agrupamento de páginas por mês. |
| `segmenter.test.js` | Valida a segmentação dos PDFs: seis holerites no primeiro arquivo, dois no segundo, um no terceiro e fallback seguro no quarto. Também testa a integração com o extrator local. |

## Dados usados pelos testes

- Os testes com PDFs utilizam os arquivos `holerite-1.pdf` a `holerite-4.pdf` do diretório configurado como entrada da aplicação.
- `fixtures/payroll-01-audit.txt` contém o gabarito usado exclusivamente pelo benchmark do primeiro holerite.
- Os testes automatizados usam o modo mock na chamada de extração para não depender de credenciais ou de uma chamada externa à IA.
