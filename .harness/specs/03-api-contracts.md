# Especificação Modular 03: Contratos da API HTTP

O contrato HTTP abaixo é **obrigatório, estrito e literal**. Toda a avaliação automatizada de precisão e fluxo depende da conformidade exata dos endpoints, payloads e códigos de status HTTP.

---

## 🛠️ Endpoints Obrigatórios

### 1. `POST /api/transcricoes`
Envia um arquivo PDF para transcrição.

- **Content-Type**: `multipart/form-data`
- **Parâmetros do Formulário**:
  - `arquivo`: Arquivo PDF (binary).
  - `tipo`: String — `"cartao-ponto"` ou `"holerite"`.

#### Resposta de Sucesso:
```http
HTTP/1.1 202 Accepted
Content-Type: application/json

{
  "id": "abc123"
}
```

> [!WARNING]
> **Processamento Assíncrono Obrigatório**:
> O upload DEVE responder imediatamente com `202 Accepted` e um `id` gerado. NUNCA execute o OCR/extração de forma síncrona dentro da requisição HTTP, pois isso causa estouro de timeout no proxy em produção.

---

### 2. `GET /api/transcricoes/:id`
Consulta o status e o resultado do processamento da transcrição.

#### Resposta de Sucesso (Processamento Concluído):
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "abc123",
  "tipo": "cartao-ponto",
  "status": "concluido",
  "erro": null,
  "value": {
    "pages": [ ... ]
  }
}
```

#### Valores do campo `status`:
- `"processando"`: O job está em fila ou sendo extraído. O campo `value` é `null`.
- `"concluido"`: A transcrição terminou. O campo `value` contém a estrutura JSON completa do documento.
- `"erro"`: Falha no processamento. O campo `value` é `null` e `erro` traz uma mensagem legível.

---

### 3. `PUT /api/transcricoes/:id`
Substitui a transcrição armazenada com as edições efetuadas pelo usuário na interface de revisão.

- **Content-Type**: `application/json`
- **Body**:
```json
{
  "value": {
    "pages": [ ... ]
  }
}
```

#### Resposta de Sucesso:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "id": "abc123",
  "status": "concluido",
  "value": { ... }
}
```

---

### 4. `GET /api/transcricoes/:id/planilha`
Faz o download da planilha consolidada (com as correções efetuadas).

- **Query Parameters**: `?formato=xlsx` | `csv` | `json` (padrão: `xlsx`).
- **Headers de Resposta**: `Content-Disposition: attachment; filename="..."`
- **Formatos Aceitos**:
  - `xlsx`: Arquivo binário Excel (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).
  - `csv`: Texto delimitado (`text/csv`).
  - `json`: JSON exportado (`application/json`).

---

### 5. `GET /healthz`
Endpoint de healthcheck para monitoramento de infraestrutura e orquestradores.

#### Resposta:
```http
HTTP/1.1 200 OK
Content-Type: application/json

{
  "status": "ok"
}
```

---

## 🔒 Tratamento de Erros e Validação
- **Upload Inválido / Não PDF**: Responder com HTTP `400 Bad Request` ou `422 Unprocessable Entity`.
- **Transcrição Não Encontrada**: Responder com HTTP `404 Not Found`.
- **Tamanho Excedido**: Limitador de upload com HTTP `413 Payload Too Large`.
