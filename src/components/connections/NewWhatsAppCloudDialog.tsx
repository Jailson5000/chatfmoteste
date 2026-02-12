import { useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";

interface NewWhatsAppCloudDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function NewWhatsAppCloudDialog({ open, onClose, onCreated }: NewWhatsAppCloudDialogProps) {
  const [displayName, setDisplayName] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();
  const { tenant } = useTenant();
  const lawFirmId = tenant?.id;

  const handleCreate = async () => {
    if (!displayName.trim() || !phoneNumberId.trim() || !accessToken.trim()) {
      toast({ title: "Preencha todos os campos", variant: "destructive" });
      return;
    }
    if (!lawFirmId) {
      toast({ title: "Erro de autenticação", variant: "destructive" });
      return;
    }

    setIsCreating(true);
    try {
      // Encrypt the access token via edge function
      const { data: encData } = await supabase.functions.invoke("meta-api", {
        body: { action: "encrypt_token", token: accessToken },
      });

      const encryptedToken = encData?.encrypted || accessToken;

      // Insert meta_connection
      const { error } = await supabase.from("meta_connections").insert({
        law_firm_id: lawFirmId,
        type: "whatsapp_cloud",
        page_id: phoneNumberId.trim(),
        page_name: displayName.trim(),
        access_token_encrypted: encryptedToken,
        is_active: true,
      } as any);

      if (error) throw error;

      toast({ title: "Conexão WhatsApp Cloud criada com sucesso!" });
      setDisplayName("");
      setPhoneNumberId("");
      setAccessToken("");
      onCreated();
      onClose();
    } catch (err: any) {
      console.error("Error creating WhatsApp Cloud connection:", err);
      toast({ title: "Erro ao criar conexão", description: err.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-[#25D366]" />
            Nova Conexão WhatsApp Cloud (API Oficial)
          </DialogTitle>
          <DialogDescription>
            Configure a API oficial do WhatsApp via Meta Business Platform
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nome da Conexão</Label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Ex: WhatsApp Comercial"
              disabled={isCreating}
            />
          </div>

          <div className="space-y-2">
            <Label>Phone Number ID</Label>
            <Input
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="Ex: 123456789012345"
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              Encontre em Meta Developers → WhatsApp → API Setup
            </p>
          </div>

          <div className="space-y-2">
            <Label>Access Token (Permanente)</Label>
            <Input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Token de acesso permanente"
              disabled={isCreating}
            />
            <p className="text-xs text-muted-foreground">
              Gere um token permanente em Meta Business Settings → System Users
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isCreating}>
            Cancelar
          </Button>
          <Button
            onClick={handleCreate}
            disabled={isCreating || !displayName.trim() || !phoneNumberId.trim() || !accessToken.trim()}
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Criando...
              </>
            ) : (
              "Criar Conexão"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
