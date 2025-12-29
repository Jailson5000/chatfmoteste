import { XCircle, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import miauchatLogo from "@/assets/miauchat-logo.png";

/**
 * CompanyBlocked - Displayed when a company's approval_status is 'rejected'
 * 
 * This page blocks access to the system for companies that were rejected.
 */

interface CompanyBlockedProps {
  reason?: string;
}

export default function CompanyBlocked({ reason }: CompanyBlockedProps) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 p-4">
      <Card className="w-full max-w-lg border-zinc-800 bg-zinc-900/50 backdrop-blur-sm shadow-2xl">
        <CardContent className="pt-8 pb-8 px-8">
          {/* Logo */}
          <div className="flex flex-col items-center gap-4 mb-8">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/[0.08] blur-lg rounded-full scale-105" />
              <img 
                src={miauchatLogo} 
                alt="MiauChat" 
                className="relative w-24 h-24 object-contain bg-transparent drop-shadow-[0_0_10px_rgba(239,68,68,0.15)]" 
              />
            </div>
            <div className="text-center">
              <span className="font-bold text-2xl text-white block">MIAUCHAT</span>
              <span className="text-zinc-500 text-sm">Plataforma de Comunicação</span>
            </div>
          </div>

          {/* Status Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-500" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-white text-center mb-4">
            Acesso não autorizado
          </h1>

          {/* Main Message */}
          <p className="text-zinc-300 text-center mb-6">
            O cadastro desta empresa não foi aprovado para acesso ao sistema.
          </p>

          {/* Reason (if provided) */}
          {reason && reason !== 'Não informado' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
              <p className="text-zinc-400 text-sm text-center">
                <span className="text-red-400 font-medium">Motivo: </span>
                {reason}
              </p>
            </div>
          )}

          {/* Status Badge */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-500/10 border border-red-500/20">
              <XCircle className="w-4 h-4 text-red-500" />
              <span className="text-red-400 text-sm font-medium">
                Cadastro não aprovado
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-800 my-6" />

          {/* Contact */}
          <div className="text-center">
            <p className="text-zinc-500 text-sm mb-2">
              Se você acredita que houve um engano, entre em contato
            </p>
            <a 
              href="mailto:suporte@miauchat.com.br"
              className="inline-flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors"
            >
              <Mail className="w-4 h-4" />
              suporte@miauchat.com.br
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
