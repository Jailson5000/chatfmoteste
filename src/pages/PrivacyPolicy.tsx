import { ArrowLeft, Home } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export default function PrivacyPolicy() {
  // SEO: Set document title and meta tags
  useEffect(() => {
    document.title = "Política de Privacidade | MiauChat";
    
    // Update meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', 'Política de Privacidade da MiauChat - Saiba como protegemos seus dados pessoais e respeitamos sua privacidade.');
    
    // Add canonical link
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://www.miauchat.com.br/privacidade');
    
    return () => {
      document.title = "MiauChat";
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl mx-auto py-12 px-4">
        <div className="flex items-center gap-4 mb-8">
          <Link to="/">
            <Button variant="ghost">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
          </Link>
          <a 
            href="https://www.miauchat.com.br/" 
            className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-1"
          >
            <Home className="h-4 w-4" />
            www.miauchat.com.br
          </a>
        </div>

        <h1 className="text-4xl font-bold mb-2">Política de Privacidade</h1>
        <p className="text-muted-foreground mb-8">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Introdução</h2>
            <p className="text-muted-foreground leading-relaxed">
              A MiauChat ("nós", "nosso" ou "Plataforma") está comprometida em proteger a privacidade dos usuários 
              de nossa plataforma de automação e atendimento inteligente. Esta Política de Privacidade descreve 
              como coletamos, usamos, armazenamos e protegemos suas informações pessoais.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Informações que Coletamos</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">Coletamos os seguintes tipos de informações:</p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Informações de Cadastro:</strong> Nome, e-mail, telefone, CNPJ/CPF e dados da empresa.</li>
              <li><strong>Dados de Comunicação:</strong> Mensagens trocadas através da plataforma para fins de operação do serviço.</li>
              <li><strong>Informações de Uso:</strong> Dados sobre como você utiliza nossa plataforma, incluindo logs de acesso e interações.</li>
              <li><strong>Dados de Integração:</strong> Informações necessárias para integrar com serviços de terceiros (WhatsApp, Google Calendar, etc.).</li>
              <li><strong>Informações de Clientes:</strong> Dados dos seus clientes gerenciados através da plataforma.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Como Usamos suas Informações</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">Utilizamos suas informações para:</p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Fornecer, operar e manter nossa plataforma</li>
              <li>Processar e gerenciar suas comunicações e agendamentos</li>
              <li>Treinar e operar agentes de inteligência artificial para atendimento automatizado</li>
              <li>Enviar notificações, lembretes e mensagens operacionais</li>
              <li>Melhorar e personalizar sua experiência na plataforma</li>
              <li>Fornecer suporte técnico e atendimento ao cliente</li>
              <li>Cumprir obrigações legais e regulatórias</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Compartilhamento de Informações</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Podemos compartilhar suas informações com:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li><strong>Provedores de Serviço:</strong> Empresas que nos auxiliam na operação (hospedagem, processamento de pagamentos, etc.).</li>
              <li><strong>Integrações:</strong> Serviços de terceiros que você autoriza (WhatsApp Business API, Google Calendar, etc.).</li>
              <li><strong>Requisitos Legais:</strong> Quando exigido por lei ou ordem judicial.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              <strong>Não vendemos suas informações pessoais para terceiros.</strong>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Segurança dos Dados</h2>
            <p className="text-muted-foreground leading-relaxed">
              Implementamos medidas de segurança técnicas e organizacionais para proteger suas informações, incluindo:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-4">
              <li>Criptografia de dados em trânsito e em repouso</li>
              <li>Controles de acesso baseados em função (RBAC)</li>
              <li>Monitoramento contínuo de segurança</li>
              <li>Backups regulares</li>
              <li>Isolamento de dados entre empresas (multi-tenant)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Retenção de Dados</h2>
            <p className="text-muted-foreground leading-relaxed">
              Retemos suas informações pelo tempo necessário para fornecer nossos serviços ou conforme exigido por lei. 
              Dados de mensagens e conversas são mantidos de acordo com as configurações da sua conta e requisitos legais aplicáveis.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Seus Direitos (LGPD)</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              De acordo com a Lei Geral de Proteção de Dados (LGPD), você tem direito a:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Confirmar a existência de tratamento de dados</li>
              <li>Acessar seus dados pessoais</li>
              <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
              <li>Anonimizar, bloquear ou eliminar dados desnecessários</li>
              <li>Portabilidade dos dados a outro fornecedor</li>
              <li>Eliminar dados pessoais tratados com consentimento</li>
              <li>Revogar o consentimento a qualquer momento</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Cookies e Tecnologias Similares</h2>
            <p className="text-muted-foreground leading-relaxed">
              Utilizamos cookies e tecnologias similares para melhorar sua experiência, analisar o uso da plataforma 
              e personalizar conteúdo. Você pode gerenciar suas preferências de cookies através das configurações do seu navegador.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Alterações nesta Política</h2>
            <p className="text-muted-foreground leading-relaxed">
              Podemos atualizar esta Política de Privacidade periodicamente. Notificaremos sobre alterações 
              significativas através da plataforma ou por e-mail. Recomendamos revisar esta política regularmente.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Contato</h2>
            <p className="text-muted-foreground leading-relaxed">
              Para exercer seus direitos ou esclarecer dúvidas sobre esta política, entre em contato:
            </p>
            <ul className="list-none mt-4 space-y-2 text-muted-foreground">
              <li><strong>E-mail:</strong> suporte@miauchat.com.br</li>
              <li><strong>Site:</strong> www.miauchat.com.br</li>
            </ul>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t">
          <div className="flex flex-col items-center gap-4">
            <a 
              href="https://www.miauchat.com.br/" 
              className="text-primary hover:underline text-sm"
            >
              ← Voltar para a página principal
            </a>
            <p className="text-sm text-muted-foreground text-center">
              © {new Date().getFullYear()} MiauChat. Todos os direitos reservados.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
