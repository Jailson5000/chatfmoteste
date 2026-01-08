import { Link2, PenTool, ShoppingCart } from "lucide-react";
import { GoogleCalendarIntegration } from "./integrations/GoogleCalendarIntegration";
import { TrayChatIntegration } from "./integrations/TrayChatIntegration";
import { IntegrationCard } from "./IntegrationCard";
import { SettingsHelpCollapsible } from "./SettingsHelpCollapsible";

// Placeholder icons for coming soon integrations
function AdvBoxIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
      <span className="text-white text-[10px] font-bold">ADV</span>
    </div>
  );
}

function CustomToolIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
      <Link2 className="h-5 w-5 text-white" />
    </div>
  );
}

function PdfReaderIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center">
      <span className="text-white text-xs font-bold">PDF</span>
    </div>
  );
}

function DocuSignIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-yellow-500 flex items-center justify-center">
      <PenTool className="h-5 w-5 text-black" />
    </div>
  );
}

function TrayCommerceIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-orange-500 flex items-center justify-center">
      <ShoppingCart className="h-5 w-5 text-white" />
    </div>
  );
}

export function IntegrationsSettings() {
  return (
    <div className="space-y-6">
      {/* Info Section */}
      <SettingsHelpCollapsible
        title="Como funcionam as Integrações?"
        items={[
          { text: "Integrações permitem conectar a plataforma a outras ferramentas para ampliar suas funcionalidades." },
          { text: "Configure integrações para automatizar processos, centralizar informações e facilitar o fluxo de trabalho." },
          { text: "Cada integração pode exigir credenciais ou permissões específicas. Siga as instruções de configuração para ativar." },
        ]}
        tip="Explore as integrações disponíveis para potencializar o uso da plataforma e tornar sua operação mais eficiente."
      />

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Active Integrations - Available first */}
        <GoogleCalendarIntegration />
        <TrayChatIntegration />
        
        {/* Coming Soon Integrations */}
        <IntegrationCard
          icon={<AdvBoxIcon />}
          title="ADV BOX"
          description="O software jurídico que reúne a gestão do escritório de advocacia. Integre processos e clientes automaticamente."
          isComingSoon
        />
        
        <IntegrationCard
          icon={<CustomToolIcon />}
          title="Custom Tool"
          description="Crie chamadas de API personalizadas para os agentes. Defina endpoints, headers, query parameters e body para processos customizados."
          isComingSoon
        />
        
        <IntegrationCard
          icon={<PdfReaderIcon />}
          title="Leitor de PDF"
          description="Extração automática de informações de documentos PDF como contratos e petições. Use nos seus agentes de IA."
          isComingSoon
        />
        
        <IntegrationCard
          icon={<DocuSignIcon />}
          title="Assinatura Digital"
          description="Integração com plataformas de assinatura eletrônica para contratos e documentos jurídicos."
          isComingSoon
        />
        
        <IntegrationCard
          icon={<TrayCommerceIcon />}
          title="Tray Commerce"
          description="Integre pedidos, produtos, cupons e frete do seu e-commerce Tray."
          isComingSoon
        />
      </div>
    </div>
  );
}
