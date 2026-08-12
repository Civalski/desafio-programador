---
name: excel-generator
description: Instruções e contexto focado para implementação da exportação de planilhas e formatação condicional de cores.
---

# Skill: Gerador de Planilhas e Destaques Visuais

Ative esta skill quando estiver criando a exportação em Excel (`.xlsx`), CSV ou JSON.

---

## 📌 Regras Focadas de Estilização

1. **Cabeçalho**: Texto Negrito Branco (`#FFFFFF`) sobre fundo Azul Escuro (`#173772`).
2. **Destaque Amarelo (`#FFF3CD`)**: Aplicado se a linha possuir batida ímpar, página vazia ou caractere `?`.
3. **Destaque Vermelho (`#F8D7DA`) + Borda (`#DC3545`)**: Aplicado se houver data ou mês não sequencial.
4. **Precedência**: Vermelho ganha de amarelo se ambos ocorrerem na mesma linha.

---

## 🔗 Referência Completa
Consulte a especificação técnica detalhada em [04-excel-export.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/04-excel-export.md).
