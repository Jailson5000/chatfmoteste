

# Correção: Exclusão de Profissionais na Agenda Pro

## Problema Identificado

### Erro Exibido (da imagem)
```text
Não foi possível remover
null value in column "professional_id" of relation "agenda_pro_appointments" violates not-null constraint
```

### Causa Raiz
A migração anterior configurou a FK como `ON DELETE SET NULL`, porém a coluna `professional_id` é `NOT NULL` no schema:

```text
┌────────────────────────────────────────────────────────────┐
│ Coluna: professional_id                                    │
│ - is_nullable: NO (NOT NULL)                               │
│ - ON DELETE: SET NULL (da FK)                              │
│                                                            │
│ Conflito! SET NULL não funciona com NOT NULL.             │
└────────────────────────────────────────────────────────────┘
```

---

## Solução Proposta

### Fluxo de Exclusão com 3 Opções

```text
Usuário clica em "Excluir Profissional"
           │
           ▼
┌──────────────────────────────────────────────────────────┐
│ Modal: "Excluir Profissional: {nome}"                    │
│                                                          │
│ ⚠️ Este profissional possui X agendamentos vinculados.   │
│                                                          │
│ O que deseja fazer com os agendamentos?                  │
│                                                          │
│ ○ Transferir para outro profissional                     │
│   [Dropdown: Selecionar profissional ▼]                  │
│                                                          │
│ ○ Excluir todos os agendamentos junto                    │
│   ⚠️ Esta ação não pode ser desfeita!                    │
│                                                          │
│ [Cancelar]  [Confirmar Exclusão]                         │
└──────────────────────────────────────────────────────────┘
```

### Mudanças Necessárias

#### 1. Migração SQL: Permitir NULL em `professional_id`

```sql
-- Permitir NULL em professional_id para suportar exclusão com histórico
ALTER TABLE public.agenda_pro_appointments 
ALTER COLUMN professional_id DROP NOT NULL;
```

Com isso, agendamentos históricos ficam com `professional_id = NULL` após excluir o profissional, mas mantêm os dados do agendamento.

#### 2. Hook `useAgendaProProfessionals.tsx`

**Nova função `deleteProfessionalWithOptions`:**

```typescript
const deleteProfessionalWithOptions = useMutation({
  mutationFn: async ({ 
    id, 
    action, 
    transferToId 
  }: { 
    id: string; 
    action: 'transfer' | 'delete_all' | 'set_null';
    transferToId?: string;
  }) => {
    if (!lawFirm?.id) throw new Error("Empresa não encontrada");

    if (action === 'transfer' && transferToId) {
      // Transferir agendamentos para outro profissional
      const { error: transferError } = await supabase
        .from("agenda_pro_appointments")
        .update({ professional_id: transferToId })
        .eq("professional_id", id)
        .eq("law_firm_id", lawFirm.id);
      
      if (transferError) throw transferError;
    } else if (action === 'delete_all') {
      // Excluir todos os agendamentos vinculados
      const { error: deleteApptError } = await supabase
        .from("agenda_pro_appointments")
        .delete()
        .eq("professional_id", id)
        .eq("law_firm_id", lawFirm.id);
      
      if (deleteApptError) throw deleteApptError;
    }
    // action === 'set_null' → deixa ON DELETE SET NULL fazer o trabalho

    // Agora exclui o profissional
    const { error } = await supabase
      .from("agenda_pro_professionals")
      .delete()
      .eq("id", id)
      .eq("law_firm_id", lawFirm.id);
    
    if (error) throw error;
  },
});
```

**Função auxiliar para contar agendamentos:**

```typescript
const getAppointmentCount = async (professionalId: string): Promise<number> => {
  if (!lawFirm?.id) return 0;
  
  const { count, error } = await supabase
    .from("agenda_pro_appointments")
    .select("id", { count: 'exact', head: true })
    .eq("professional_id", professionalId)
    .eq("law_firm_id", lawFirm.id);
  
  return error ? 0 : (count || 0);
};
```

#### 3. Componente `AgendaProProfessionals.tsx`

**Novo estado e modal:**

```typescript
const [deleteOption, setDeleteOption] = useState<'transfer' | 'delete_all'>('transfer');
const [transferToId, setTransferToId] = useState<string>('');
const [appointmentCount, setAppointmentCount] = useState(0);
const [loadingCount, setLoadingCount] = useState(false);
```

**Modal de exclusão aprimorado:**

```tsx
<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
  <AlertDialogContent className="max-w-md">
    <AlertDialogHeader>
      <AlertDialogTitle className="text-destructive flex items-center gap-2">
        <AlertTriangle className="h-5 w-5" />
        Excluir Profissional
      </AlertDialogTitle>
      <AlertDialogDescription className="space-y-3">
        <p>
          Tem certeza que deseja excluir <strong>"{deletingProfessional?.name}"</strong>?
        </p>
        
        {appointmentCount > 0 && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-sm">
            <p className="font-medium text-yellow-600">
              ⚠️ {appointmentCount} agendamento(s) vinculado(s)
            </p>
            <p className="text-muted-foreground mt-1">
              O que deseja fazer com estes agendamentos?
            </p>
            
            <RadioGroup value={deleteOption} onValueChange={(v) => setDeleteOption(v as 'transfer' | 'delete_all')}>
              <div className="flex items-center space-x-2 mt-3">
                <RadioGroupItem value="transfer" id="transfer" />
                <Label htmlFor="transfer">Transferir para outro profissional</Label>
              </div>
              
              {deleteOption === 'transfer' && (
                <Select value={transferToId} onValueChange={setTransferToId}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Selecionar profissional..." />
                  </SelectTrigger>
                  <SelectContent>
                    {otherProfessionals.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              <div className="flex items-center space-x-2 mt-2">
                <RadioGroupItem value="delete_all" id="delete_all" />
                <Label htmlFor="delete_all" className="text-destructive">
                  Excluir todos os agendamentos
                </Label>
              </div>
            </RadioGroup>
          </div>
        )}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction 
        onClick={handleDeleteWithOptions}
        disabled={deleteOption === 'transfer' && !transferToId}
        className="bg-destructive"
      >
        Confirmar Exclusão
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

#### 4. Trocar Profissional em Agendamentos Existentes

**Adicionar seletor de profissional no `AgendaProAppointmentSheet.tsx`:**

```tsx
// Novo estado
const [changeProfessionalOpen, setChangeProfessionalOpen] = useState(false);
const [newProfessionalId, setNewProfessionalId] = useState<string>('');

// Botão na interface
<Button 
  variant="outline" 
  size="sm" 
  className="gap-2"
  onClick={() => setChangeProfessionalOpen(true)}
>
  <UserCog className="h-4 w-4" />
  Trocar Profissional
</Button>

// Dialog para trocar
<Dialog open={changeProfessionalOpen} onOpenChange={setChangeProfessionalOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Trocar Profissional</DialogTitle>
    </DialogHeader>
    
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Profissional atual: <strong>{appointment.professional?.name}</strong>
      </p>
      
      <div>
        <Label>Novo profissional</Label>
        <Select value={newProfessionalId} onValueChange={setNewProfessionalId}>
          <SelectTrigger>
            <SelectValue placeholder="Selecionar..." />
          </SelectTrigger>
          <SelectContent>
            {activeProfessionals
              .filter(p => p.id !== appointment.professional_id)
              .map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    </div>
    
    <DialogFooter>
      <Button variant="outline" onClick={() => setChangeProfessionalOpen(false)}>
        Cancelar
      </Button>
      <Button 
        onClick={handleChangeProfessional}
        disabled={!newProfessionalId || isUpdating}
      >
        Confirmar Troca
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| **Migração SQL** | Permitir NULL em `professional_id` |
| `src/hooks/useAgendaProProfessionals.tsx` | Nova função `deleteProfessionalWithOptions` + `getAppointmentCount` |
| `src/components/agenda-pro/AgendaProProfessionals.tsx` | Modal de exclusão com opções de transferir/excluir |
| `src/components/agenda-pro/AgendaProAppointmentSheet.tsx` | Botão "Trocar Profissional" em cada agendamento |
| `src/hooks/useAgendaProAppointments.tsx` | Função `changeProfessional` |

---

## Fluxo Completo Após Correção

```text
Excluir Profissional "Gabii"
           │
           ▼
┌─────────────────────────────────────┐
│ Verificar: quantos agendamentos?    │
└─────────────────────────────────────┘
           │
     ┌─────┴─────┐
     │           │
   0 agend.    N > 0
     │           │
     ▼           ▼
 Excluir      Mostrar modal
 direto       com opções
                 │
        ┌────────┴────────┐
        │                 │
   Transferir        Excluir Tudo
        │                 │
        ▼                 ▼
  UPDATE apts       DELETE apts
  SET prof = X      WHERE prof = Y
        │                 │
        └────────┬────────┘
                 │
                 ▼
          DELETE professional
                 │
                 ▼
           ✓ Sucesso!
```

---

## Testes Recomendados

1. **Excluir profissional SEM agendamentos** → Deve funcionar diretamente
2. **Excluir profissional COM agendamentos + transferir** → Verificar se agendamentos foram movidos
3. **Excluir profissional COM agendamentos + excluir tudo** → Verificar se agendamentos foram removidos
4. **Trocar profissional em agendamento individual** → Verificar se funciona na tela de detalhes
5. **Verificar mensagens de erro** → Devem ser amigáveis, não técnicas

