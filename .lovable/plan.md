
# Corrigir: QR Code nao aparece na pagina Global Admin

## Problema Real Identificado

O backend ESTA gerando o QR Code com sucesso (confirmado nos logs: `QR Code extracted: true`). O problema esta na pagina **Global Admin Connections** (`/global-admin/connections`):

1. O botao "Reiniciar Conexao" chama `restartInstance.mutate()` que faz `get_qrcode` no backend
2. O backend retorna o QR Code no campo `data.qrCode`
3. Mas o `restartInstance` no hook `useGlobalAdminInstances` apenas mostra um **toast** ("QR Code disponivel") - **nunca exibe o QR Code visualmente**
4. A pagina Global Admin **nao tem nenhum componente de dialog para exibir QR Codes** (diferente da pagina `/connections` do tenant que tem o `QRCodeDialog`)

## Solucao

### 1. Adicionar estado e dialog de QR Code na pagina GlobalAdminConnections

- Adicionar estados: `qrDialogOpen`, `qrCode`, `qrInstanceName`
- Quando o usuario clicar em "Reiniciar Conexao", capturar o retorno do `restartInstance` e, se tiver `qrCode`, abrir o dialog com a imagem
- Reutilizar o componente existente `QRCodeDialog` que ja existe em `src/components/connections/QRCodeDialog.tsx`

### 2. Modificar o botao "Reiniciar Conexao" para exibir QR

Em vez de usar `restartInstance.mutate()` diretamente, criar um handler que:
1. Chama `restartInstance.mutateAsync()`
2. Verifica se o retorno contem `qrCode`
3. Se sim, abre o `QRCodeDialog` com a imagem do QR
4. Se a instancia ja esta conectada, mostra apenas o toast

### 3. Adicionar botao dedicado "Gerar QR Code"

Adicionar uma opcao no dropdown de acoes especificamente para gerar QR Code, visivel quando a instancia nao esta conectada. Isso facilita a reconexao de instancias desconectadas.

## Detalhes Tecnicos

### Arquivo: `src/pages/global-admin/GlobalAdminConnections.tsx`

Mudancas:
- Importar `QRCodeDialog` de `@/components/connections/QRCodeDialog`
- Adicionar estados: `adminQrCode`, `adminQrDialogOpen`, `adminQrLoading`, `adminQrError`, `adminQrInstanceName`
- Criar funcao `handleGenerateQR(instance)` que:
  - Seta estado de loading
  - Abre o dialog
  - Chama `restartInstance.mutateAsync(instance.id)`
  - Se resultado tem `qrCode`, seta `adminQrCode`
  - Se `status === "open"/"connected"`, mostra toast de ja conectado e fecha dialog
- Adicionar no dropdown de acoes um item "Gerar QR Code" para instancias nao conectadas
- Renderizar o `QRCodeDialog` no final do componente

### Arquivo: `src/hooks/useGlobalAdminInstances.tsx`

Nenhuma mudanca necessaria - o `restartInstance` ja retorna o `qrCode` no resultado do `mutateAsync`. A tipagem ja inclui `qrCode?: string` no retorno.

### Nenhuma mudanca no backend

O backend ja funciona corretamente. Os logs confirmam que o QR Code e gerado e retornado com sucesso.
