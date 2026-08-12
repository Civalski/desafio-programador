---
name: cartao-ponto-extractor
description: Instruções e contexto focado para implementar, testar ou debugar o extrator de Cartão de Ponto.
---

# Skill: Extrator de Cartão de Ponto

Ative esta skill quando estiver trabalhando em parsers, OCR ou estruturação de dados de **Cartão de Ponto**.

---

## 📌 Checklist de Implementação do Extrator

1. **Leitura de PDF & OCR**:
   - Tentar extração de texto estruturado do PDF.
   - Se o resultado for em branco (documento escaneado), disparar pipeline de OCR (ex: Tesseract).

2. **Parsing de Linhas**:
   - Manter `days[]` na ordem física do documento. NUNCA reordenar por data.
   - Preservar `date_raw` exatamente como impresso.
   - Extrair batidas em pares entrada/saída (`kind`: `"IN"` / `"OUT"`).
   - Manter `time_raw` original e `time_hhmm` normalizado (24h).
   - Se o dia constar no documento mas não tiver batida, incluir `{ "date_raw": "...", "punches": [] }`.

3. **Incerteza (`?`)**:
   - Caracteres não identificados com 100% de certeza devem ser gravados como `?` em `time_raw` e `time_hhmm`.

---

## 🔗 Referência Completa
Consulte a especificação técnica detalhada em [01-domain-cartao-ponto.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/01-domain-cartao-ponto.md).
