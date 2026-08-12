# Especificação Modular 06: Arquitetura, Docker, API Gemini & Open Source

Este módulo detalha as exigências arquiteturais, integração com a API do **Google Gemini**, padrões de projeto **Open Source de produção**, containerização Docker e normas de segurança/privacidade.

---

## 🏛️ 1. Arquitetura de Produção & Visão Open Source

Embora este projeto responda a um desafio técnico, ele está sendo construído como um **sistema real de nível de produção e projeto Open Source**.

### Princípios de Engenharia de Produção:
- **Clean Architecture / Separated Concerns**: Separação clara entre camada HTTP, fila de background jobs, clientes de serviços externos (Gemini API), serviços de domínio e formatadores de exportação.
- **Padrão Open Source**: Código modular, tipado, legível, extensível para novos layouts e tipos de documentos, configurável via variáveis de ambiente com arquivo `.env.example`.
- **Pipeline Único**: Cartão de ponto e holerite compartilham os módulos de upload, fila assíncrona, persistência, interface web e exportação. O que varia são os parsers/schemas específicos do tipo de documento.

---

## 🤖 2. Leitura com IA: API Gemini (Google Gen AI)

O motor de extração de documentos utilizará a **API do Gemini** (modelo `gemini-2.5-flash` / Document Intelligence) em substituição a motores legados:

1. **Autenticação & Variáveis de Ambiente**:
   - A chave de API do Gemini deve ser passada estritamente via variável de ambiente: `GEMINI_API_KEY`.
   - NUNCA exponha a chave de API no código ou repositório.

2. **Fluxo de Extração**:
   - O worker de segundo plano envia o PDF para os endpoints/SDK do Mindee.
   - O retorno bruto do Mindee é transformado e mapeado para o contrato JSON estrito do projeto (`cartao-ponto` ou `holerite`).
   - Em caso de falha da API (ex: rate limit, falha de rede, PDF gigante), registrar o erro de forma clara (`status: "erro"`, `erro: "Mensagem..."`) sem derrubar a aplicação.

---

## 🐳 3. Docker & Operação

1. **`Dockerfile`**:
   - Multi-stage build otimizado para produção.
   - Instalação de dependências mínimas e execução com usuário não-root por segurança.

2. **`docker-compose.yml`**:
   - Permite subir todo o ambiente de forma simples com `docker compose up`.
   - Injeta as variáveis de ambiente necessárias (incluindo `MINDEE_API_KEY`).

---

## 🛡️ 4. Segurança, Privacidade & PII

1. **Validação de Upload**:
   - Validar mime-type e magic bytes (`%PDF-`) do arquivo enviado.
   - Limite de tamanho configurável (ex: máx 20MB).

2. **Privacidade nos Logs (PII)**:
   - NUNCA registrar dados de identificação pessoal (CPF, salários, nomes de funcionários) nos logs do servidor. Logs devem conter apenas IDs de trabalho, métricas de tempo e status.

3. **Política de Retenção de Dados**:
   - Documentar em `SOLUCAO.md` a política de limpeza e ciclo de vida dos arquivos PDF e transcrições temporárias.
