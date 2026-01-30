
# Correção: Scroll na Lista de Empresas Ativas (Global Admin)

## Problema Identificado

Na página `/global-admin/companies`, na aba "Aprovadas", a tabela de empresas está cortada na parte inferior e **não é possível rolar** para ver todas as empresas. Na imagem enviada, a empresa "Miau" aparece parcialmente cortada.

### Causa Raiz

A tabela de empresas aprovadas está dentro de um `<Card>` > `<CardContent>` > `<Table>` **sem** um componente de scroll (como `ScrollArea`). Outras tabelas no sistema (ex: `CompanyUsageTable.tsx`) usam corretamente:

```tsx
<ScrollArea className="max-h-[calc(100vh-200px)]">
  <Table>...</Table>
</ScrollArea>
```

Mas `GlobalAdminCompanies.tsx` não tem essa estrutura na aba "Aprovadas".

---

## Solução

Envolver a `<Table>` de empresas aprovadas em um `<ScrollArea>` com altura máxima calculada dinamicamente (`calc(100vh - X)`), onde `X` considera:
- Header do layout (~64px)
- Título da página e cards de filtro (~250px aprox.)
- Margem de segurança

### Padrão Utilizado no Sistema

Seguindo o padrão de `CompanyUsageTable.tsx`:
```tsx
<ScrollArea className="max-h-[calc(100vh-200px)]">
  <Table>
    <TableHeader className="sticky top-0 bg-background">
      ...
    </TableHeader>
    <TableBody>
      ...
    </TableBody>
  </Table>
</ScrollArea>
```

---

## Alterações Necessárias

### Arquivo: `src/pages/global-admin/GlobalAdminCompanies.tsx`

1. **Importar `ScrollArea`** (se ainda não estiver importado)
2. **Envolver a tabela de empresas aprovadas** em `<ScrollArea className="max-h-[calc(100vh-400px)]">`
3. **Tornar o `<TableHeader>` sticky** para que os cabeçalhos fiquem fixos durante a rolagem

### Código Antes:
```tsx
<CardContent>
  {isLoading ? (
    <div>...</div>
  ) : (
    <Table>
      <TableHeader>
        <TableRow>...</TableRow>
      </TableHeader>
      <TableBody>
        {/* rows */}
      </TableBody>
    </Table>
  )}
</CardContent>
```

### Código Depois:
```tsx
<CardContent className="p-0">
  {isLoading ? (
    <div className="p-6">...</div>
  ) : (
    <ScrollArea className="max-h-[calc(100vh-400px)]">
      <Table>
        <TableHeader className="sticky top-0 bg-card z-10">
          <TableRow>...</TableRow>
        </TableHeader>
        <TableBody>
          {/* rows */}
        </TableBody>
      </Table>
    </ScrollArea>
  )}
</CardContent>
```

---

## Considerações Adicionais

| Item | Descrição |
|------|-----------|
| **Consistência** | Aplicar a mesma correção nas outras abas (Pendentes, Rejeitadas) se também tiverem tabelas longas |
| **Header Sticky** | O cabeçalho da tabela ficará fixo durante o scroll, mantendo contexto das colunas |
| **Altura Calculada** | `calc(100vh-400px)` considera: header (64px) + filtros (~170px) + tabs (~50px) + card header (~80px) + padding |
| **Responsividade** | A solução funciona em diferentes tamanhos de tela |

---

## Resultado Esperado

- Usuário consegue ver todas as empresas da lista
- Scroll suave dentro da tabela
- Cabeçalhos das colunas ficam visíveis durante a rolagem
- Sem regressão em outras funcionalidades da página
