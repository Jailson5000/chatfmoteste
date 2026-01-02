import { useState } from "react";
import { Info, Link2, FileText, PenTool, Briefcase, ChevronDown } from "lucide-react";
import { GoogleCalendarIntegration } from "./integrations/GoogleCalendarIntegration";
import { IntegrationCard } from "./IntegrationCard";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";

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

function TrayIcon() {
  return (
    <div className="w-10 h-10 rounded-lg bg-[#00A651] flex items-center justify-center">
      <Briefcase className="h-5 w-5 text-white" />
    </div>
  );
}

export function IntegrationsSettings() {
  const [infoOpen, setInfoOpen] = useState(false);

  return (
    <div className="space-y-6">
      {/* Info Section */}
      <Collapsible open={infoOpen} onOpenChange={setInfoOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <span className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              Como funcionam as Integrações?
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${infoOpen ? "rotate-180" : ""}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              Como funcionam as Integrações?
            </h4>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Integrações permitem conectar a plataforma a outras ferramentas para ampliar suas funcionalidades.</li>
              <li>Configure integrações para automatizar processos, centralizar informações e facilitar o fluxo de trabalho.</li>
              <li>Cada integração pode exigir credenciais ou permissões específicas. Siga as instruções de configuração para ativar.</li>
            </ol>
            <div className="mt-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm text-primary">
                💡 <strong>Dica:</strong> Explore as integrações disponíveis para potencializar o uso da plataforma e tornar sua operação mais eficiente.
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Active Integrations */}
        <GoogleCalendarIntegration />
        
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
          description="Analise documentos PDF automaticamente pelos agentes. Extraia informações, contextos e dados relevantes para respostas melhores."
          isComingSoon
        />
        
        <IntegrationCard
          icon={<DocuSignIcon />}
          title="DocuSign"
          description="A DocuSign é o padrão global para gestão de transações digitais com milhões de usuários em mais de 188 países."
          isComingSoon
        />
        
        <IntegrationCard
          icon={<TrayIcon />}
          title="Tray"
          description="Integre o chat do seu e-commerce Tray diretamente com a plataforma. Atenda clientes e gerencie conversas em um só lugar."
          isComingSoon
        />
      </div>
    </div>
  );
}
