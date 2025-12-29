import { Clock, Mail } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import miauchatLogo from "@/assets/miauchat-logo.png";

/**
 * PendingApproval - Displayed when a company's approval_status is 'pending_approval'
 * 
 * This page blocks access to the system for companies that haven't been approved yet.
 */

export default function PendingApproval() {
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
            <div className="w-16 h-16 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <Clock className="w-8 h-8 text-yellow-500 animate-pulse" />
            </div>
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-white text-center mb-4">
            Cadastro em análise
          </h1>

          {/* Main Message */}
          <p className="text-zinc-300 text-center mb-6 text-lg">
            Recebemos seu cadastro no MIAUCHAT.<br />
            Nosso time está analisando as informações enviadas.
          </p>

          {/* Support Message */}
          <div className="bg-zinc-800/50 rounded-lg p-4 mb-6">
            <p className="text-zinc-400 text-center text-sm">
              Assim que o cadastro for aprovado, você receberá um email com
              todas as instruções de acesso.
            </p>
          </div>

          {/* Status Badge */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-yellow-500/10 border border-yellow-500/20">
              <Clock className="w-4 h-4 text-yellow-500" />
              <span className="text-yellow-500 text-sm font-medium">
                Aguardando aprovação do administrador
              </span>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-zinc-800 my-6" />

          {/* Contact */}
          <div className="text-center">
            <p className="text-zinc-500 text-sm mb-2">
              Dúvidas? Entre em contato pelo email
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
