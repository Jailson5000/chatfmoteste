
# Adicionar Botao de Desconectar nas Integracoes Facebook e Instagram

## Problema Atual

Quando Facebook ou Instagram estao conectados, o card so mostra "Configuracoes" (que exibe um toast informativo) e um toggle de ativar/desativar. Nao ha opcao para **desconectar** (deletar a conexao) e reconectar outra conta.

## Solucao

Adicionar um botao "Desconectar" ao lado de "Configuracoes" no footer do card quando a integracao esta conectada. Ao clicar, exibe um dialogo de confirmacao antes de deletar a conexao do banco.

## Mudancas

### 1. `src/components/settings/IntegrationCard.tsx`
- Adicionar prop `onDisconnect` (opcional) na interface
- Quando conectado e `onDisconnect` existe, mostrar botao "Desconectar" (vermelho, com icone de Unplug) ao lado de "Configuracoes"
- Layout: Configuracoes | Desconectar | Switch (toggle)

### 2. `src/components/settings/integrations/FacebookIntegration.tsx`
- Adicionar mutation de delete (similar ao Instagram que ja tem `deleteMutation`)
- Passar `onDisconnect` com confirmacao (window.confirm) para o IntegrationCard
- Ao desconectar, invalida queries e mostra toast de sucesso

### 3. `src/components/settings/integrations/InstagramIntegration.tsx`
- Ja possui `deleteMutation` implementado mas nao esta sendo usado na UI
- Passar `onDisconnect` com confirmacao para o IntegrationCard

## Detalhes Tecnicos

No `IntegrationCard`, o footer quando conectado ficara:

```text
[Configuracoes] [Desconectar]          [Toggle Switch]
```

O botao "Desconectar" tera estilo `variant="ghost"` com texto vermelho (`text-destructive`) e icone `Unplug`. Antes de executar, um `window.confirm("Deseja desconectar?")` protege contra cliques acidentais.
