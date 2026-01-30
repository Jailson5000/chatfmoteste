
# Correção: Filtrar Profissionais por Serviço na Agenda Pública

## Problema Identificado

O erro "Nenhum profissional disponível para este serviço" ocorre porque a página de agendamento público **não filtra** os profissionais pelo serviço selecionado.

### Dados no banco (tudo correto):

| Serviço | Profissionais Vinculados | Status |
|---------|-------------------------|--------|
| Análise | Gabrielle das N Mar | ✅ Ativo |
| Análise | Jailson N R F | ✅ Ativo |
| Consulta | Gabrielle das N Mar | ✅ Ativo |
| Consulta | Jailson N R F | ✅ Ativo |

### Bug no código (`PublicBooking.tsx`):

```typescript
// PROBLEMA: Carrega TODOS os profissionais uma vez só no início
const { data: professionalsData } = await supabase
  .from("agenda_pro_professionals_public")
  .select("id, name, specialty, avatar_url")
  .eq("law_firm_id", firmId)
  .eq("is_active", true)  // ❌ Não filtra por serviço!
  .order("name");

// PROBLEMA: Quando usuário seleciona serviço, NÃO recarrega profissionais
onClick={() => {
  setSelectedService(service);
  setStep(professionals.length > 1 ? "professional" : "datetime");
  // ❌ Não busca profissionais do serviço selecionado!
}}
```

---

## Solução Proposta

Implementar filtragem dinâmica de profissionais quando um serviço é selecionado.

### Mudanças no `PublicBooking.tsx`:

1. **Criar estado e função para buscar profissionais por serviço**
2. **Recarregar profissionais filtrados ao selecionar um serviço**
3. **Usar tabela de vínculo `agenda_pro_service_professionals`**

---

## Código da Correção

### 1. Adicionar novo estado e função

```typescript
// Estado para profissionais filtrados pelo serviço
const [serviceProfessionals, setServiceProfessionals] = useState<PublicProfessional[]>([]);
const [loadingProfessionals, setLoadingProfessionals] = useState(false);

// Função para buscar profissionais vinculados ao serviço
const loadServiceProfessionals = async (serviceId: string) => {
  if (!lawFirmId) return;
  
  setLoadingProfessionals(true);
  try {
    // Buscar IDs dos profissionais vinculados ao serviço
    const { data: links } = await supabase
      .from("agenda_pro_service_professionals")
      .select("professional_id")
      .eq("service_id", serviceId);
    
    if (!links || links.length === 0) {
      setServiceProfessionals([]);
      return;
    }
    
    const professionalIds = links.map(l => l.professional_id);
    
    // Buscar dados dos profissionais da view pública
    const { data: profs } = await supabase
      .from("agenda_pro_professionals_public" as any)
      .select("id, name, specialty, avatar_url")
      .eq("law_firm_id", lawFirmId)
      .eq("is_active", true)
      .in("id", professionalIds)
      .order("name");
    
    setServiceProfessionals((profs as unknown as PublicProfessional[]) || []);
  } catch (error) {
    console.error("Error loading service professionals:", error);
    setServiceProfessionals([]);
  } finally {
    setLoadingProfessionals(false);
  }
};
```

### 2. Modificar seleção de serviço

```typescript
onClick={async () => {
  setSelectedService(service);
  await loadServiceProfessionals(service.id);
  // Usa serviceProfessionals em vez de professionals
  setStep(serviceProfessionals.length > 1 ? "professional" : "datetime");
  if (serviceProfessionals.length === 1) {
    setSelectedProfessional(serviceProfessionals[0]);
  }
}}
```

### 3. Atualizar uso no resto do componente

Substituir referências a `professionals` por `serviceProfessionals` nos pontos relevantes:
- Renderização da lista de profissionais (step "professional")
- Fallback de profissional no submit

---

## Alternativa Mais Simples (Recomendada)

Em vez de fazer duas chamadas separadas, carregar os vínculos junto com os serviços:

```typescript
// Ao carregar serviços, incluir IDs dos profissionais vinculados
const { data: servicesData } = await supabase
  .from("agenda_pro_services")
  .select(`
    id, name, description, duration_minutes, price, color,
    agenda_pro_service_professionals(professional_id)
  `)
  .eq("law_firm_id", firmId)
  .eq("is_active", true)
  .eq("is_public", true)
  .order("name");
```

E então filtrar na memória quando o serviço é selecionado:

```typescript
const getServiceProfessionals = (serviceId: string) => {
  const service = services.find(s => s.id === serviceId);
  const linkedIds = service?.professionals?.map(p => p.professional_id) || [];
  return professionals.filter(p => linkedIds.includes(p.id));
};
```

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/pages/PublicBooking.tsx` | Adicionar filtro de profissionais por serviço |

---

## Impacto

| Aspecto | Avaliação |
|---------|-----------|
| Risco | Baixo - mudança isolada na página pública |
| Arquivos | 1 arquivo |
| Regressão | Nenhuma - apenas adiciona lógica de filtro |

---

## Resultado Esperado

Após a correção:
1. Usuário seleciona serviço "Análise"
2. Sistema busca profissionais vinculados (Gabrielle e Jailson)
3. Tela de seleção de profissional mostra apenas os 2 vinculados
4. Agendamento funciona normalmente
