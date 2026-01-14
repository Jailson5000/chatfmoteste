import { ArrowLeft, Home } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";

export default function TermsOfService() {
  // SEO: Set document title and meta tags
  useEffect(() => {
    document.title = "Termos de Serviço | MiauChat";
    
    // Update meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', 'Termos de Serviço da MiauChat - Conheça as regras e condições de uso da nossa plataforma.');
    
    // Add canonical link
    let canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', 'https://www.miauchat.com.br/termos');
    
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

        <h1 className="text-4xl font-bold mb-2">Termos de Serviço</h1>
        <p className="text-muted-foreground mb-8">Última atualização: {new Date().toLocaleDateString('pt-BR')}</p>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Aceitação dos Termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Ao acessar ou usar a plataforma MiauChat ("Serviço"), você concorda em estar vinculado a estes 
              Termos de Serviço. Se você não concordar com qualquer parte dos termos, não poderá acessar o Serviço.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Descrição do Serviço</h2>
            <p className="text-muted-foreground leading-relaxed">
              A MiauChat é uma plataforma de automação e atendimento inteligente que oferece:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-4">
              <li>Gestão de comunicações via WhatsApp Business API</li>
              <li>Agentes de inteligência artificial para atendimento automatizado</li>
              <li>Sistema de agendamento inteligente</li>
              <li>CRM e gestão de relacionamento com clientes</li>
              <li>Integrações com serviços de terceiros</li>
              <li>Relatórios e análises de desempenho</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Cadastro e Conta</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Para usar o Serviço, você deve:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Fornecer informações precisas e completas durante o cadastro</li>
              <li>Manter a segurança de sua conta e senha</li>
              <li>Notificar imediatamente sobre qualquer uso não autorizado</li>
              <li>Ser responsável por todas as atividades realizadas em sua conta</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-4">
              Reservamo-nos o direito de recusar ou cancelar cadastros a nosso critério.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Uso Aceitável</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              Ao usar nosso Serviço, você concorda em <strong>NÃO</strong>:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Violar leis ou regulamentos aplicáveis</li>
              <li>Enviar spam, mensagens não solicitadas ou conteúdo abusivo</li>
              <li>Distribuir malware, vírus ou código malicioso</li>
              <li>Tentar acessar sistemas ou dados não autorizados</li>
              <li>Usar o Serviço para assédio, difamação ou atividades ilegais</li>
              <li>Revender ou redistribuir o Serviço sem autorização</li>
              <li>Violar direitos de propriedade intelectual de terceiros</li>
              <li>Fazer engenharia reversa ou descompilar o software</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">5. Planos e Pagamentos</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">
              O Serviço é oferecido em diferentes planos de assinatura:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground">
              <li>Os preços e recursos de cada plano estão disponíveis em nossa página de planos</li>
              <li>Pagamentos são processados mensalmente ou anualmente, conforme o plano escolhido</li>
              <li>Renovações são automáticas, salvo cancelamento prévio</li>
              <li>Preços podem ser alterados com aviso prévio de 30 dias</li>
              <li>Reembolsos são avaliados caso a caso conforme nossa política</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Limites de Uso</h2>
            <p className="text-muted-foreground leading-relaxed">
              Cada plano possui limites específicos de uso, incluindo número de usuários, instâncias de WhatsApp, 
              agentes de IA e mensagens. O excedente pode resultar em cobranças adicionais ou suspensão temporária 
              do serviço até adequação do plano.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">7. Integrações de Terceiros</h2>
            <p className="text-muted-foreground leading-relaxed">
              O Serviço pode integrar-se com serviços de terceiros (WhatsApp, Google, etc.). 
              O uso dessas integrações está sujeito aos termos de serviço dos respectivos provedores. 
              Não nos responsabilizamos por interrupções ou alterações nesses serviços de terceiros.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Propriedade Intelectual</h2>
            <p className="text-muted-foreground leading-relaxed">
              A MiauChat e todo seu conteúdo, recursos e funcionalidades são de propriedade exclusiva da empresa 
              e estão protegidos por leis de direitos autorais, marcas registradas e outras leis de propriedade intelectual.
            </p>
            <p className="text-muted-foreground leading-relaxed mt-4">
              Você mantém todos os direitos sobre o conteúdo que você envia ou cria através do Serviço.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Privacidade e Dados</h2>
            <p className="text-muted-foreground leading-relaxed">
              O tratamento de dados pessoais é regido por nossa{" "}
              <a href="/privacidade" className="text-primary hover:underline">
                Política de Privacidade
              </a>
              , que faz parte integrante destes Termos. Ao usar o Serviço, você também concorda com nossa Política de Privacidade.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Disponibilidade do Serviço</h2>
            <p className="text-muted-foreground leading-relaxed">
              Nos esforçamos para manter o Serviço disponível 24/7, mas não garantimos disponibilidade ininterrupta. 
              O Serviço pode estar indisponível devido a manutenção programada, atualizações ou circunstâncias fora de nosso controle.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Limitação de Responsabilidade</h2>
            <p className="text-muted-foreground leading-relaxed">
              Na máxima extensão permitida por lei, a MiauChat não será responsável por:
            </p>
            <ul className="list-disc pl-6 space-y-2 text-muted-foreground mt-4">
              <li>Danos indiretos, incidentais, especiais ou consequenciais</li>
              <li>Perda de lucros, receitas, dados ou oportunidades de negócio</li>
              <li>Interrupções ou falhas causadas por terceiros</li>
              <li>Conteúdo enviado por usuários através da plataforma</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Suspensão e Rescisão</h2>
            <p className="text-muted-foreground leading-relaxed">
              Podemos suspender ou encerrar sua conta imediatamente, sem aviso prévio, se você violar estes Termos. 
              Você pode cancelar sua conta a qualquer momento através das configurações da plataforma ou entrando em contato conosco.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">13. Alterações nos Termos</h2>
            <p className="text-muted-foreground leading-relaxed">
              Reservamo-nos o direito de modificar estes Termos a qualquer momento. Alterações significativas serão 
              notificadas por e-mail ou através da plataforma. O uso continuado do Serviço após as alterações 
              constitui aceitação dos novos termos.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">14. Lei Aplicável</h2>
            <p className="text-muted-foreground leading-relaxed">
              Estes Termos são regidos pelas leis da República Federativa do Brasil. Qualquer disputa será 
              resolvida no foro da comarca de domicílio do usuário, conforme previsto no Código de Defesa do Consumidor.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">15. Contato</h2>
            <p className="text-muted-foreground leading-relaxed">
              Para dúvidas sobre estes Termos de Serviço, entre em contato:
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
