# Especificação Modular 05: Interface Web de Revisão

Este módulo especifica os requisitos de experiência de usuário (UX/UI) para a interface de upload, acompanhamento e revisão dos documentos transcritos.

---

## 📐 Layout Lado a Lado (Split View)

A tela de revisão DEVE exibir dois painéis principais lado a lado para permitir auditoria visual rápida sem necessidade de alternar abas ou janelas:

```
+------------------------------------+------------------------------------+
|                                    |                                    |
|         Visualizador do PDF        |         Tabela Editável            |
|         (Documento Original)       |      (Transcrição Extraída)        |
|                                    |                                    |
+------------------------------------+------------------------------------+
```

---

## 🎨 Componentes da Interface

1. **Painel de Upload & Progresso**:
   - Selector de arquivo PDF (com validação client-side `.pdf`).
   - Seletor de tipo de documento: Radio/Dropdown com `"Cartão de Ponto"` e `"Holerite"`.
   - Botão de envio com feedback visual (spinner/barra de progresso).
   - Polling ou Server-Sent Events (SSE) para consultar `GET /api/transcricoes/:id` sem travar a tela enquanto o status for `"processando"`.

2. **Visualizador de PDF**:
   - Renderizador embutido de PDF (ex: `pdf.js` ou `<iframe>` nativo com suporte a navegação por páginas).

3. **Tabela Editável**:
   - Espelha as colunas da planilha do tipo selecionado.
   - Permite que o usuário clique e edite os valores de células (inclusive corrigindo o caractere `?` para o valor real).
   - Destaques de Alertas em tempo real: As linhas com incertezas, batidas ímpares ou quebras de sequência recebem as cores amarelo (`#FFF3CD`) e vermelho (`#F8D7DA` com borda `#DC3545`).
   - Exibição do motivo do alerta ao passar o mouse ou em um painel explicativo.

4. **Barra de Ações**:
   - Botão **Salvar Correções** (dispara `PUT /api/transcricoes/:id`).
   - Botão **Baixar Planilha** (dispara `GET /api/transcricoes/:id/planilha?formato=xlsx`).
   - Seleção de formato de download (`.xlsx`, `.csv`, `.json`).

---

## ♿ Usabilidade e Resiliência
- Se o processamento falhar (`status: "erro"`), exibir uma mensagem clara e amigável sem quebrar o layout da página.
- Mudanças feitas na tabela devem poder ser salvas e imediatamente refletidas no download da planilha.
