
# Remover QR Code do Global Admin e Corrigir Erros

## Resumo

A funcionalidade de "Gerar QR Code" foi adicionada por engano na pagina Global Admin Connections. Essa funcionalidade pertence apenas a pagina do tenant (`/connections`). Vamos remover todo o codigo relacionado.

Os erros de "Invalid authorization token" e "Access denied" no `evolution-health` ja foram corrigidos na ultima alteracao e os logs confirmam que a funcao esta funcionando normalmente desde 23:54. Nenhuma alteracao adicional e necessaria no backend.

## Alteracoes

### Arquivo: `src/pages/global-admin/GlobalAdminConnections.tsx`

Remover os seguintes elementos:

1. **Imports** (linhas 60-62):
   - Remover `QrCode` do import do lucide-react
   - Remover `import { QRCodeDialog } from "@/components/connections/QRCodeDialog"`

2. **Estados de QR Code** (linhas 205-208):
   - Remover `qrDialogOpen`, `qrCode`, `qrLoading`, `qrError`

3. **Funcao `handleGenerateQR`** (linhas 210-237):
   - Remover toda a funcao

4. **Botao "Gerar QR Code" na view agrupada** (linhas 818-826):
   - Remover o `DropdownMenuItem` com "Gerar QR Code" do dropdown de acoes na tabela agrupada

5. **Botao "Gerar QR Code" na view lista** (linhas 1138-1146):
   - Remover o `DropdownMenuItem` com "Gerar QR Code" do dropdown de acoes na tabela lista

6. **Componente QRCodeDialog** (linhas 1328-1347):
   - Remover a renderizacao do `QRCodeDialog` no final do componente

### Nenhuma alteracao no backend

Os logs do `evolution-health` confirmam que a funcao esta operando normalmente desde as 23:54 UTC. Os erros reportados (23:48-23:52) foram de versoes anteriores do deploy.
