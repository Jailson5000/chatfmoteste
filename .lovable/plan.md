

# Configuracao do Provedor WhatsApp no Global Admin Settings

## O que sera feito

Adicionar um novo card na pagina de Configuracoes do Global Admin (`GlobalAdminSettings.tsx`) para:

1. Escolher o provedor WhatsApp padrao (Evolution API ou uazapi)
2. Configurar URL do servidor uazapi e token admin
3. Salvar tudo via `system_settings` (mesmo padrao usado para payment_provider, maintenance_mode, etc.)

## Detalhes Tecnicos

### Arquivo modificado: `src/pages/global-admin/GlobalAdminSettings.tsx`

Sera adicionado um novo Card entre o card de "Plataforma de Pagamento" e o de "Aviso de Instabilidade", contendo:

- **RadioGroup** para escolher entre "Evolution API" e "uazapi" (chave: `default_whatsapp_provider`)
- Quando "uazapi" estiver selecionado, exibir campos:
  - **Server URL** (chave: `uazapi_server_url`) - ex: `https://minha-instancia.uazapi.com`
  - **Admin Token** (chave: `uazapi_admin_token`) - campo password com toggle de visibilidade
- Cada campo tera seu botao de salvar individual, seguindo o padrao existente da pagina
- Badge visual indicando o provedor ativo

### Chaves no system_settings

| Chave | Descricao | Exemplo |
|---|---|---|
| `default_whatsapp_provider` | Provedor padrao | `"evolution"` ou `"uazapi"` |
| `uazapi_server_url` | URL base do servidor uazapi | `"https://x.uazapi.com"` |
| `uazapi_admin_token` | Token de admin do uazapi | `"token_secreto"` |

Nao serao necessarias migracoes SQL - a tabela `system_settings` ja existe e aceita chave/valor dinamicamente via `createSetting` / `updateSetting`.

### Componentes reutilizados

- `RadioGroup` / `RadioGroupItem` (ja importado no arquivo)
- `Input`, `Label`, `Switch`, `Button`, `Badge`, `Separator` (ja importados)
- Hook `useSystemSettings` (ja em uso na pagina)

### Nenhum arquivo novo necessario

Toda a mudanca sera feita em um unico arquivo.
