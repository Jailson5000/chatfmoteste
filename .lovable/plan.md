
# ✅ CONCLUÍDO: PDFs Não Aparecendo + Download Base64 Bloqueando Processamento

## Correções Implementadas

### 1. Download PDF base64 removido do bloco de detecção de tipo
- O download de 10s que bloqueava o salvamento da mensagem foi removido
- Mensagens de documento são SEMPRE salvas imediatamente

### 2. Base64 não é mais armazenado na fila (JSONB)
- Apenas metadados leves são armazenados: `document_file_name`, `document_mime_type`, `whatsapp_message_key`
- Elimina falha silenciosa de insert por tamanho excessivo

### 3. Download on-demand no processador da fila
- PDF base64 é baixado via Evolution API apenas quando a IA vai processar
- Timeout de 15s com fallback seguro (IA processa sem o conteúdo do PDF)

### 4. Validação de mensagem vazia corrigida no ai-chat
- `!message` alterado para `message === undefined || message === null`
- Imagens sem legenda e documentos não causam mais erro 400
