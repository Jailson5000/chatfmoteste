

# Remover Chat Web da Pagina de Conexoes

## Contexto

A pagina de Conexoes (`/connections`) atualmente exibe 3 tipos de itens:
- WhatsApp (Evolution API) - conexao ativa com QR Code
- WhatsApp Cloud (API Oficial) - conexao via Meta OAuth
- Chat Web - widget de atendimento

O Chat Web nao precisa de gerenciamento de conexao (nao tem QR Code, status de conexao, webhook, etc). Ele ja esta disponivel na aba **Integracoes** em Configuracoes, que e o lugar correto.

Instagram e Facebook tambem ja estao na aba Integracoes e nao devem ser trazidos para Conexoes, pois nao sao "conexoes WhatsApp".

## Mudanca

### `src/pages/Connections.tsx`

Remover o bloco do Chat Web da tabela (linhas 551-667). Isso inclui:
- A row condicional `{trayIntegration?.is_enabled && (...)}` inteira
- O Sheet de detalhes do Chat Web (`isTrayDetailOpen`)
- As importacoes e estados relacionados ao Chat Web que ficarem orfaos (`isTrayDetailOpen`, `useTrayIntegration`, etc)

### O que permanece na pagina de Conexoes

1. **WhatsApp (QR Code)** - instancias da Evolution API
2. **WhatsApp Cloud (API Oficial)** - conexoes da meta_connections com type=whatsapp_cloud

### O que permanece na aba Integracoes (Configuracoes)

1. Chat Web (ja esta la)
2. Instagram (ja esta la)
3. Facebook (ja esta la)
4. WhatsApp Cloud (ja esta la)

## Detalhes Tecnicos

### Remocoes no `Connections.tsx`

1. Remover o estado `isTrayDetailOpen` e seu Sheet associado
2. Remover o bloco JSX da row do Chat Web (linhas 551-667)
3. Remover importacoes que ficarem sem uso (`useTrayIntegration` se nao for mais usado em outro lugar da pagina)
4. Manter a verificacao de `filteredInstances.length === 0` sem considerar `trayIntegration` (linha 670 - remover `&& !trayIntegration?.is_enabled`)

### Impacto

- Nenhuma funcionalidade perdida: o Chat Web continua gerenciavel em Configuracoes > Integracoes
- A pagina de Conexoes fica focada no que realmente importa: conexoes WhatsApp
- Codigo mais limpo e menos confuso para o usuario

## Risco

Zero. Apenas remocao de UI duplicada. A funcionalidade do Chat Web permanece intacta na aba de Integracoes.
