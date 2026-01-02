import { GoogleCalendarCard } from "./GoogleCalendarCard";

export function IntegrationsSettings() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Integrações</h3>
        <p className="text-sm text-muted-foreground">
          Conecte serviços externos para expandir as funcionalidades da plataforma.
        </p>
      </div>

      <div className="grid gap-4">
        <GoogleCalendarCard />
      </div>
    </div>
  );
}
