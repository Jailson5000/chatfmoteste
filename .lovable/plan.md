
# Correção: Scroll nas Tabelas de Empresas (Dashboard e Companies)

## Problema Identificado

Duas páginas com problemas de scroll que cortam a visualização das empresas:

1. **Dashboard (`/global-admin`)** - A tabela `CompanyUsageTable` não mostra todas as empresas
2. **Empresas Aprovadas (`/global-admin/companies`)** - Tabela cortada após a correção anterior

### Causa Raiz

O problema está na altura calculada do ScrollArea ser muito restritiva, especialmente quando há muitos elementos acima (header, filtros, tabs, cards). O valor `calc(100vh-400px)` pode resultar em uma área muito pequena.

---

## Solução

### 1) GlobalAdminDashboard.tsx

O container que envolve o `CompanyUsageTable` não precisa de altura fixa. O componente já tem seu próprio ScrollArea interno. Porém, pode haver conflito de overflow. Vamos:

- Adicionar `overflow-hidden` no container pai para evitar conflitos
- O `CompanyUsageTable` já gerencia seu próprio scroll

### 2) GlobalAdminCompanies.tsx  

Ajustar a altura do ScrollArea de `calc(100vh-400px)` para um valor mais generoso `calc(100vh-320px)` e garantir que o container permita o scroll funcionar corretamente.

### 3) Verificar o container do CompanyUsageTable.tsx

O valor atual `max-h-[calc(100vh-200px)]` pode estar sendo limitado pelo container pai que tem padding. Ajustar para considerar o layout completo.

---

## Alterações Propostas

### Arquivo 1: `src/pages/global-admin/GlobalAdminDashboard.tsx`

Alterar o container do `CompanyUsageTable` para permitir o scroll interno funcionar:

```tsx
// Antes (linha 371)
<div ref={tableRef} className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">

// Depois
<div ref={tableRef} className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
```

### Arquivo 2: `src/pages/global-admin/GlobalAdminCompanies.tsx`

Aumentar a altura disponível para o ScrollArea:

```tsx
// Antes (linha 1100)
<ScrollArea className="max-h-[calc(100vh-400px)]">

// Depois  
<ScrollArea className="max-h-[calc(100vh-320px)]">
```

### Arquivo 3: `src/components/global-admin/CompanyUsageTable.tsx`

Ajustar a altura para considerar todos os elementos do dashboard:

```tsx
// Antes (linha 754)
<ScrollArea className="max-h-[calc(100vh-200px)]">

// Depois - mais conservador considerando header do dashboard
<ScrollArea className="max-h-[calc(100vh-480px)]">
```

---

## Cálculo das Alturas

### Dashboard (CompanyUsageTable)
- Header do layout: ~64px
- Título + botões export: ~60px
- Grid de stats: ~120px
- Grid de charts: ~400px (mas com flex pode comprimir)
- Padding + gaps: ~36px
- **Total acima da tabela: ~680px** (mas charts/stats comprimem)
- Valor seguro: `calc(100vh-480px)` permite ~520px em tela 1080p

### Empresas Aprovadas
- Header do layout: ~64px
- Breadcrumb + título: ~80px
- Tabs: ~50px
- Card header: ~60px
- Filtros/date: ~60px
- **Total: ~314px**
- Valor: `calc(100vh-320px)` permite ~760px em tela 1080p

---

## Resultado Esperado

| Página | Antes | Depois |
|--------|-------|--------|
| Dashboard | Tabela cortada | Scroll funcional, todas as empresas acessíveis |
| Empresas Aprovadas | Tabela cortada | Scroll funcional, header sticky visível |

---

## Arquivos a Modificar

1. `src/pages/global-admin/GlobalAdminDashboard.tsx` - Container overflow
2. `src/pages/global-admin/GlobalAdminCompanies.tsx` - Altura do ScrollArea
3. `src/components/global-admin/CompanyUsageTable.tsx` - Altura do ScrollArea
