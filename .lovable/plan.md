

# Ajuste de Polling: Manutenção, Alertas e Notificações Admin para 12h

Mudanças diretas em 3 arquivos, apenas alterando o valor numérico do `refetchInterval`.

## Mudanças

| Arquivo | Atual | Novo | Economia adicional |
|---|---|---|---|
| `useMaintenanceMode.tsx` | 300.000ms (5 min) | 43.200.000ms (12h) | ~42K req/mês |
| `useSystemAlert.tsx` | 300.000ms (5 min) | 43.200.000ms (12h) | ~42K req/mês |
| `useAdminNotifications.tsx` | 120.000ms (2 min) | 43.200.000ms (12h) | ~42K req/mês |

**Economia adicional estimada: ~126K requests/mês**

Risco zero -- são dados que quase nunca mudam. Se precisar forçar atualização imediata, basta o usuário recarregar a página.

