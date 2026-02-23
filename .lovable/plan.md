
# Implementar Modo de Manutencao Funcional

## Problema
O toggle "Modo de Manutencao" no painel do Admin Global salva o valor `maintenance_mode = true` no banco de dados, mas **nenhum componente lê essa configuracao**. Os clientes continuam acessando o sistema normalmente, mesmo com o modo ativado.

## Solucao

Criar 3 componentes e integrar no fluxo de protecao de rotas:

### 1. Hook `useMaintenanceMode`
- Novo arquivo: `src/hooks/useMaintenanceMode.tsx`
- Consulta a tabela `system_settings` buscando a chave `maintenance_mode`
- Faz polling a cada 30 segundos para detectar mudancas em tempo real
- Retorna `{ isMaintenanceMode, isLoading }`
- **NAO** requer autenticacao (usa query publica ou acesso anon)

### 2. Pagina `MaintenancePage`
- Novo arquivo: `src/pages/MaintenancePage.tsx`
- Tela fullscreen com icone de ferramenta/engrenagem
- Exibe mensagem: "Sistema em manutencao. Estamos trabalhando para melhorar sua experiencia."
- Mostra logo do MiauChat
- Visual similar as outras paginas de bloqueio (PendingApproval, CompanySuspended)

### 3. Integracao no `ProtectedRoute`
- Arquivo: `src/components/auth/ProtectedRoute.tsx`
- Adicionar verificacao de `maintenance_mode` **antes** de todos os outros checks
- Se `maintenance_mode === true`, renderiza `MaintenancePage`
- **Excecao**: Administradores Globais (verificados via `is_admin()`) podem continuar acessando normalmente

## Sequencia de verificacao no ProtectedRoute

```text
1. Auth loading?         --> Spinner
2. Nao autenticado?      --> /auth
3. MANUTENCAO ATIVA?     --> MaintenancePage (exceto global admins)
4. Pending approval?     --> PendingApproval
5. Rejected?             --> CompanyBlocked
6. Suspended?            --> CompanySuspended
7. Trial expired?        --> TrialExpired
8. Subdomain mismatch?   --> TenantMismatch
9. Must change password? --> /change-password
10. OK                   --> children
```

## Detalhes tecnicos

### Hook `useMaintenanceMode`
- Usa `useQuery` com `queryKey: ["maintenance-mode"]`
- `refetchInterval: 30000` (30s) para captar desativacao em tempo real
- Consulta: `supabase.from("system_settings").select("value").eq("key", "maintenance_mode").single()`

### Verificacao de admin no ProtectedRoute
- Usa o hook `useAdminAuth` ja existente para verificar `is_admin()`
- Se o usuario for admin global, ignora o bloqueio de manutencao

### Arquivos modificados/criados
1. **Novo**: `src/hooks/useMaintenanceMode.tsx` (~25 linhas)
2. **Novo**: `src/pages/MaintenancePage.tsx` (~50 linhas)
3. **Editado**: `src/components/auth/ProtectedRoute.tsx` - adicionar check de manutencao apos autenticacao
