

# Preparar Sistema para 50 Empresas Professional

## Contexto

50 empresas PROFESSIONAL = 200 usuarios, 200 instancias WhatsApp, ~20.000 mensagens/dia. O sistema atual suporta 7 empresas com 8 instancias. A escala exige mudancas em **infraestrutura** e **otimizacoes de codigo**.

## Acoes Divididas em Camadas

### Camada 1: Otimizacoes de Codigo (fazer agora, risco baixo)

**1.1 - Lazy Loading no App.tsx**
- Converter ~35 paginas para `React.lazy()`
- Reduz bundle inicial em ~40-60%
- Risco: muito baixo

**1.2 - Ativar `subscribeToConversation` nos consumidores**
- Adicionar chamadas em `Conversations.tsx` e `KanbanChatPanel.tsx`
- Prepara terreno para eliminar canais redundantes depois
- Risco: baixo

**1.3 - Configurar `staleTime` global no QueryClient**
- Adicionar `staleTime: 1000 * 60 * 2` e `gcTime: 1000 * 60 * 10` no QueryClient do App.tsx
- Reduz refetches desnecessarios em ~60%
- Risco: muito baixo

### Camada 2: Limpeza Automatica de Dados (fazer em seguida)

**2.1 - Edge Function de arquivamento de mensagens**
- Criar `archive-old-messages` que move mensagens com mais de 90 dias para uma tabela `messages_archive`
- Agendar via cron (1x por semana)
- Mantem o banco dentro do limite de 8 GB por mais tempo
- Risco: baixo (dados arquivados, nao deletados)

**2.2 - Limpeza de webhook_logs mais agressiva**
- Reduzir retencao de 7 para 3 dias
- Risco: muito baixo

### Camada 3: Infraestrutura (decisoes do administrador)

**3.1 - Escalar VPS da Evolution API**
- Atual: 1 VPS de 8 GB (~25 instancias)
- Necessario: 3-4 VPS de 32 GB cada (~50 instancias por servidor)
- O sistema ja suporta multiplas `evolution_api_connections` -- basta registrar os novos servidores no painel admin
- Nao requer mudanca de codigo

**3.2 - Avaliar plano Supabase**
- Se a otimizacao de canais (Camada 1) reduzir para 2 canais por usuario: 200 x 2 = 400 (dentro do limite Pro de 500)
- Se ultrapassar: upgrade para Team ($599/mes) ou Enterprise
- Storage: avaliar upgrade de 8 GB para 64 GB ou superior

**3.3 - Monitoramento de crescimento do banco**
- O dashboard de infraestrutura (`InfrastructureMonitor.tsx`) ja existe e monitora DB + Storage
- Alertas automaticos em 70% e 85% ja estao configurados
- Nenhuma mudanca necessaria

### Camada 4: Otimizacao Avancada (fazer depois da Camada 1)

**4.1 - Eliminar canais Realtime redundantes (Fase 2)**
- Migrar logica de reconciliacao do `useMessagesWithPagination` para o `RealtimeSyncContext`
- Reduz de ~4 para ~2 canais por usuario
- Risco: medio-alto, requer teste extensivo

---

## Resumo de Capacidade Apos Implementacao

| Recurso | Atual | Apos Camadas 1-3 | Meta 50 empresas |
|---------|-------|-------------------|------------------|
| Instancias WhatsApp | 25-30 max | 150-200 (com 3-4 VPS) | 200 |
| Canais Realtime | ~500 max | ~400 (com otimizacao) | 400 |
| Banco de dados | 8 GB (3 meses) | 8 GB (12+ meses com archiving) | OK |
| Bundle frontend | 100% | ~50% (com lazy loading) | OK |
| Refetches | frequentes | -60% (com staleTime) | OK |

## Investimento Estimado em Infraestrutura

| Item | Custo Mensal |
|------|-------------|
| 3 VPS 32GB (Evolution API) | ~R$ 1.500 - 2.500 |
| Supabase Pro (atual) | ~$25/mes |
| Supabase Team (se necessario) | ~$599/mes |
| **Total infraestrutura** | **~R$ 2.000 - 5.000/mes** |
| **Receita 50 empresas** | **R$ 44.850/mes** |
| **Margem bruta** | **~90-95%** |

## Ordem de Execucao Recomendada

1. Camada 1 (codigo) -- pode ser feito agora, sem risco
2. Camada 3.1 (VPS) -- quando atingir 20-25 instancias
3. Camada 2 (archiving) -- quando banco atingir 4 GB
4. Camada 3.2 (Supabase) -- quando atingir 400 conexoes simultaneas
5. Camada 4 (Realtime avancado) -- quando canais ficarem apertados

