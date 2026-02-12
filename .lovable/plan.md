

# Corrigir OAuth Meta: Popup + Redirect URI Fixo + Dominio miauchat.com.br

## O que configurar no Meta Developer Dashboard

Na tela que voce esta vendo ("Login do Facebook para Empresas" > Configuracoes), preencha assim:

### URIs de redirecionamento do OAuth validos
Adicione estas URIs (uma por linha):
```
https://miauchat.com.br/auth/meta-callback
https://chatfmoteste.lovable.app/auth/meta-callback
```

A primeira e para producao (seu dominio). A segunda e para testes no Lovable.

### Dominios permitidos para o SDK do JavaScript
```
miauchat.com.br
chatfmoteste.lovable.app
```

### Configuracoes de OAuth do cliente
- **Login no OAuth do cliente**: Sim
- **Login do OAuth na Web**: Sim
- **Forcar HTTPS**: Sim
- **Usar modo estrito para URIs de redirecionamento**: Sim
- **Login OAuth no navegador incorporado**: Nao
- **Forcar reautenticacao do OAuth na Web**: Nao

### Desautorizar URL de retorno de chamada
```
https://miauchat.com.br/auth/meta-deauth
```

### Solicitacoes de exclusao de dados
```
https://miauchat.com.br/auth/meta-data-deletion
```

(Esses dois ultimos podem ser URLs simples que retornam um JSON de confirmacao -- a Meta exige que existam mas nao precisa de logica complexa.)

---

## Mudancas no codigo

### Mudanca 1: Redirect URI fixo no `meta-config.ts`

Em vez de usar `window.location.origin` (que muda por subdominio), usar um dominio fixo. Detectar automaticamente se esta em producao (`miauchat.com.br`) ou desenvolvimento (`chatfmoteste.lovable.app`).

```typescript
function getFixedRedirectUri(): string {
  const origin = window.location.origin;
  if (origin.includes("miauchat.com.br")) {
    return "https://miauchat.com.br/auth/meta-callback";
  }
  return "https://chatfmoteste.lovable.app/auth/meta-callback";
}
```

Usar essa funcao em `buildMetaOAuthUrl` para garantir que o `redirect_uri` sempre corresponda ao que esta cadastrado na Meta.

### Mudanca 2: Voltar ao popup com postMessage

**Arquivos:** `InstagramIntegration.tsx` e `FacebookIntegration.tsx`

Trocar `window.location.href = authUrl` por:
```typescript
const popup = window.open(authUrl, "meta-oauth", "width=600,height=700,scrollbars=yes");

// Listener para receber resultado do popup
const handleMessage = (event: MessageEvent) => {
  if (event.data?.type === "meta-oauth-success") {
    window.removeEventListener("message", handleMessage);
    queryClient.invalidateQueries({ queryKey: ["meta-connection"] });
    toast.success("Conectado com sucesso!");
  }
  if (event.data?.type === "meta-oauth-error") {
    window.removeEventListener("message", handleMessage);
    toast.error(event.data.message || "Erro ao conectar");
  }
};
window.addEventListener("message", handleMessage);
```

### Mudanca 3: MetaAuthCallback usa postMessage + fecha popup

**Arquivo:** `MetaAuthCallback.tsx`

Apos processar o codigo OAuth com sucesso:
- Se abriu como popup (`window.opener` existe): envia `postMessage` para a janela principal e fecha o popup
- Se nao e popup (fallback): faz redirect normal

```typescript
// Apos sucesso:
if (window.opener) {
  window.opener.postMessage({ type: "meta-oauth-success" }, "*");
  window.close();
} else {
  navigate("/settings?tab=integrations");
}

// Apos erro:
if (window.opener) {
  window.opener.postMessage({ type: "meta-oauth-error", message: "..." }, "*");
  window.close();
} else {
  navigate("/settings");
}
```

### Mudanca 4: Callback tambem usa redirect URI fixo

No `MetaAuthCallback.tsx`, trocar:
```typescript
const redirectUri = `${window.location.origin}/auth/meta-callback`;
```
Por usar a mesma funcao `getFixedRedirectUri()` de `meta-config.ts`, garantindo que o `redirect_uri` enviado para trocar o codigo seja identico ao usado na URL de autorizacao.

## Resultado

- Clicar "Conectar" abre popup pequeno (600x700) com login da Meta
- A Meta redireciona para o redirect URI fixo (`miauchat.com.br` ou `chatfmoteste.lovable.app`)
- O callback processa tudo em uma chamada, avisa a janela principal via postMessage
- O popup fecha automaticamente
- A janela principal mostra toast de sucesso e atualiza o card
- Funciona de qualquer subdominio (*.miauchat.com.br) porque o redirect URI e sempre fixo

