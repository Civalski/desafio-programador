# Especificação Modular 06: Arquitetura, Docker & Segurança

Este módulo detalha as exigências arquiteturais, containerização em Docker e normas de segurança/privacidade de dados.

---

## 🏛️ Arquitetura de Pipeline Único

> [!IMPORTANT]
> **Um Pipeline, Dois Extratores**:
> Cartão de Ponto e Holerite compartilham os módulos de:
> - Envio / Upload HTTP
> - Fila de Processamento Assíncrono
> - Armazenamento de estado da transcrição
> - Interface Web de Revisão e Tabela Editável
> - Download e geração de planilha
> 
> O que muda é apenas o módulo leitor/parser específico do tipo de documento. Criar duas aplicações distintas resultará em perda de pontos no critério de Arquitetura.

---

## 🐳 Docker & Operação

1. **`Dockerfile`**:
   - Imagem otimizada (Multi-stage build).
   - Instalação de dependências do sistema necessárias para OCR (ex: `tesseract-ocr` e pacotes de idioma `tesseract-ocr-por` se optar por Tesseract).

2. **`docker-compose.yml`**:
   - Permite subir todo o ambiente de forma simples com `docker compose up`.
   - Mapeamento de portas e variáveis de ambiente configuráveis.
   - NENHUM segredo (API keys ou senhas) deve estar hardcoded no código ou repositório.

---

## 🛡️ Segurança & Privacidade de Dados (PII)

Como a aplicação lida com documentos trabalhistas reais (contendo CPF, salários, horários e dados pessoais):

1. **Validação de Upload**:
   - Validar mime-type e magic bytes do arquivo enviando para garantir que seja efetivamente um PDF.
   - Limite de tamanho de upload (ex: máximo 20MB por arquivo).

2. **Privacidade nos Logs**:
   - NUNCA registrar informações de identificação pessoal (PII) como nomes de funcionários, números de CPF ou valores salariais nos logs da aplicação/servidor.

3. **Política de Retenção de Dados**:
   - Documentar explicitamente em `SOLUCAO.md` qual a política de retenção dos arquivos salvos (ex: expiração em memória, limpeza periódica de temporários).
