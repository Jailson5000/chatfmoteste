
# Adição do META_CONFIG_ID ao Projeto

## Objetivo
Configurar o `VITE_META_CONFIG_ID` com o valor obtido do Meta Developer Console (`1461954655333752`) para que o fluxo de WhatsApp Embedded Signup funcione corretamente.

## Contexto
- O Configuration ID foi criado com sucesso na Meta Developer Console
- O ID é: `1461954655333752`
- Este ID é necessário para que o `FB.login()` no componente `NewWhatsAppCloudDialog.tsx` funcione corretamente
- O arquivo `.env` já contém as variáveis Supabase, apenas precisa da nova linha

## Mudanças Necessárias

### 1. Atualizar `.env`
- Adicionar a nova variável ao final do arquivo `.env`:
  ```
  VITE_META_CONFIG_ID="1461954655333752"
  ```

### 2. Verificação no Componente
- O componente `src/components/connections/NewWhatsAppCloudDialog.tsx` já importa `META_CONFIG_ID` de `src/lib/meta-config.ts`
- O arquivo `src/lib/meta-config.ts` já possui a lógica para ler a variável:
  ```typescript
  export const META_CONFIG_ID = import.meta.env.VITE_META_CONFIG_ID || "";
  ```
- Após adicionar a variável ao `.env`, o sistema automaticamente carregará o valor

### 3. Comportamento Esperado
- O banner de erro "META_APP_ID ou META_CONFIG_ID não configurados" desaparecerá
- O botão "Conectar com Facebook" ficará habilitado
- Clicar no botão abrirá o fluxo de Embedded Signup do WhatsApp

## Fluxo de Teste Após Implementação

1. **Ir para a página de Conexões**
   - Navigate para `/connections`

2. **Procurar por "WhatsApp Cloud (API Oficial)"**
   - O botão "Conectar com Facebook" deve estar ativo

3. **Clicar no botão de conexão**
   - Deve abrir um popup de login do Facebook
   - Aceitar o fluxo de Embedded Signup
   - Você verá um modal solicitando a seleção/criação de um portfólio e conta WhatsApp

4. **Completar o fluxo**
   - Selecionar ou criar uma conta WhatsApp Business
   - Inserir e verificar um número de telefone
   - Confirmar para completar a conexão

5. **Verificação no Painel de Conexão**
   - Após conectar, a conexão aparecerá na lista
   - Abrir o painel de detalhes
   - A seção "Templates de Mensagem" deve aparecer e listar templates (se houver)

## Próximas Etapas

Após adicionar o `META_CONFIG_ID`:

1. **Teste o fluxo de conexão** - Verifique se o Embedded Signup funciona corretamente
2. **Configure o webhook** - Adicione a Callback URL do webhook na Meta Developer Console
3. **Crie um template de teste** - Use a seção de Templates para criar um template simples
4. **Teste envio/recebimento** - Envie uma mensagem através do sistema

Isso preparará tudo para gravar os vídeos de demonstração exigidos pela Meta para o App Review.
