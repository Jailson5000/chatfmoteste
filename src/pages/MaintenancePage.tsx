import { Wrench } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";

export default function MaintenancePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-4">
            <Wrench className="w-8 h-8 text-amber-500" />
          </div>
          <CardTitle className="text-xl">Sistema em Manutenção</CardTitle>
          <CardDescription>
            Estamos trabalhando para melhorar sua experiência. Por favor, tente novamente em alguns minutos.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
            <p className="text-sm text-amber-700 dark:text-amber-400 text-center">
              Nossa equipe está realizando uma manutenção programada. O sistema estará disponível novamente em breve.
            </p>
          </div>
          <p className="text-center text-xs text-muted-foreground">
            Dúvidas? Entre em contato pelo email{" "}
            <a href="mailto:suporte@miauchat.com.br" className="text-primary hover:underline">
              suporte@miauchat.com.br
            </a>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
