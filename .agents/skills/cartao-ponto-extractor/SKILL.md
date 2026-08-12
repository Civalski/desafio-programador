---
name: cartao-ponto-extractor
description: Instruções e contexto focado para implementar, testar ou debugar o extrator de Cartão de Ponto via Mindee API.
---

# Skill: Extrator de Cartão de Ponto (via API Mindee)

Ative esta skill quando estiver trabalhando no serviço de extração e parsing de dados de **Cartão de Ponto**.

---

## 📌 Checklist de Implementação do Extrator

1. **Integração com API Mindee**:
   - Enviar o arquivo PDF enviado para a API do Mindee utilizando a chave `MINDEE_API_KEY`.
   - Processar o retorno da IA do Mindee e mapear as coordenadas/predições de texto para o contrato JSON estrito.

2. **Parsing de Linhas**:
   - Manter `days[]` na ordem física do documento. NUNCA reordenar por data.
   - Preservar `date_raw` exatamente como retornado/impresso.
   - Extrair batidas em pares entrada/saída (`kind`: `"IN"` / `"OUT"`).
   - Manter `time_raw` original e `time_hhmm` normalizado (24h).
   - Se o dia constar no documento mas não tiver batida, incluir `{ "date_raw": "...", "punches": [] }`.

3. **Incerteza (`?`)**:
   - Caracteres não identificados pela IA do Mindee com alta confiança devem ser gravados como `?` em `time_raw` e `time_hhmm`.

---

## 🔗 Referência Completa
Consulte a especificação técnica detalhada em [01-domain-cartao-ponto.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/01-domain-cartao-ponto.md) e [06-architecture-ops.md](file:///c:/Users/Alisson%20Civalski/Documents/Quick/desafio-programador/.harness/specs/06-architecture-ops.md).
