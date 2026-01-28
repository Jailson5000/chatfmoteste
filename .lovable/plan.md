

# Adicionar Seção de Vídeo Tutorial na Landing Page

## Objetivo

Adicionar uma seção na landing page com um vídeo do YouTube que mostra como criar uma conta, fazer o cadastro e acessar a plataforma MiauChat.

**ID do Vídeo:** `q9VESHWqHBQ`

## Localização

A seção será adicionada **após a seção Hero** (logo após os CTAs principais) e **antes da seção "Agentes IA ON"**. Este é o posicionamento ideal porque:

1. Visitantes veem o vídeo logo no início
2. Ajuda a converter interessados mostrando simplicidade do cadastro
3. Reduz dúvidas sobre o processo de onboarding

## Design da Seção

Seguindo o padrão visual da landing page:
- Fundo escuro com borda sutil
- Título chamativo com destaque em vermelho
- Player de vídeo responsivo (16:9)
- Ícone de contexto (Play/Video)

## Estrutura Visual

```text
+--------------------------------------------------+
|                                                  |
|  ▶️  VEJA COMO É SIMPLES                        |
|                                                  |
|     Como criar sua conta e                      |
|     começar a usar o MiauChat                    |
|                                                  |
|  +--------------------------------------------+  |
|  |                                            |  |
|  |       [  Vídeo YouTube Embed  ]            |  |
|  |           (16:9 ratio)                     |  |
|  |                                            |  |
|  +--------------------------------------------+  |
|                                                  |
|     Assista e veja como é fácil começar         |
|                                                  |
+--------------------------------------------------+
```

## Mudanças no Código

### Arquivo: `src/pages/landing/LandingPage.tsx`

**1. Adicionar import do ícone PlayCircle:**
```tsx
import {
  // ... imports existentes
  PlayCircle,
} from "lucide-react";
```

**2. Adicionar nova seção após o Hero (linha ~327):**
```tsx
{/* Seção - Vídeo Tutorial */}
<section className="relative z-10 py-16 md:py-20 border-t border-white/[0.06]">
  <div className="max-w-4xl mx-auto px-6">
    <div className="text-center mb-8">
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-red-500/10 border border-red-500/20 mb-6">
        <PlayCircle className="h-7 w-7 text-red-500" strokeWidth={1.5} />
      </div>
      <p className="text-red-500 text-xs font-medium tracking-widest uppercase mb-3">
        Veja como é simples
      </p>
      <h2 className="text-2xl md:text-3xl font-bold leading-tight">
        Como criar sua conta e
        <br />
        <span className="text-red-500">começar a usar o MiauChat</span>
      </h2>
      <p className="mt-4 text-base text-white/50">
        Assista ao vídeo e veja como é fácil começar
      </p>
    </div>
    
    {/* Video Container */}
    <div className="relative rounded-2xl overflow-hidden border border-white/[0.06] bg-black/50">
      <div className="aspect-video">
        <iframe
          src="https://www.youtube.com/embed/q9VESHWqHBQ"
          title="Como criar conta no MiauChat"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full h-full border-0"
        />
      </div>
    </div>
  </div>
</section>
```

## Características Técnicas

1. **Responsivo**: Usa `aspect-video` (16:9) do Tailwind para manter proporção
2. **Consistente**: Segue o mesmo padrão visual das outras seções
3. **Performante**: Embed nativo do YouTube (lazy loading automático)
4. **Acessível**: Título descritivo no iframe para leitores de tela

## Resultado Esperado

- Nova seção aparece logo após o Hero
- Vídeo carrega diretamente no player embed
- Layout responsivo funciona em mobile e desktop
- Visual integrado com o restante da landing page

