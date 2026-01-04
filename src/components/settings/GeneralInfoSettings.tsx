import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  Save, 
  Upload, 
  Image, 
  Building2, 
  Hash, 
  Scale, 
  MapPin, 
  Instagram, 
  Facebook, 
  Globe,
  Phone,
  Mail,
  User
} from "lucide-react";
import { SettingsHelpCollapsible } from "./SettingsHelpCollapsible";

interface LawFirmData {
  name?: string;
  document?: string;
  phone?: string;
  phone2?: string;
  email?: string;
  address?: string;
  oab_number?: string;
  instagram?: string;
  facebook?: string;
  website?: string;
  logo_url?: string;
}

interface GeneralInfoSettingsProps {
  lawFirm: LawFirmData | null;
  onSave: (data: Partial<LawFirmData>) => Promise<void>;
  onLogoUpload: (file: File) => Promise<void>;
  saving: boolean;
  uploadingLogo: boolean;
}

export function GeneralInfoSettings({
  lawFirm,
  onSave,
  onLogoUpload,
  saving,
  uploadingLogo,
}: GeneralInfoSettingsProps) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  
  // Basic info
  const [officeName, setOfficeName] = useState("");
  const [officeCnpj, setOfficeCnpj] = useState("");
  const [officePhone, setOfficePhone] = useState("");
  const [officePhone2, setOfficePhone2] = useState("");
  const [officeEmail, setOfficeEmail] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  
  // Legal info
  const [oabNumber, setOabNumber] = useState("");
  
  // Social media
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [website, setWebsite] = useState("");

  useEffect(() => {
    if (lawFirm) {
      setOfficeName(lawFirm.name || "");
      setOfficeCnpj(lawFirm.document || "");
      setOfficePhone(lawFirm.phone || "");
      setOfficePhone2(lawFirm.phone2 || "");
      setOfficeEmail(lawFirm.email || "");
      setOfficeAddress(lawFirm.address || "");
      setOabNumber(lawFirm.oab_number || "");
      setInstagram(lawFirm.instagram || "");
      setFacebook(lawFirm.facebook || "");
      setWebsite(lawFirm.website || "");
    }
  }, [lawFirm]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onLogoUpload(file);
    }
  };

  const handleSave = async () => {
    await onSave({
      name: officeName,
      document: officeCnpj,
      phone: officePhone,
      phone2: officePhone2,
      email: officeEmail,
      address: officeAddress,
      oab_number: oabNumber,
      instagram,
      facebook,
      website,
    });
  };

  return (
    <div className="space-y-6">
      <SettingsHelpCollapsible
        title="Como funcionam as Informações Gerais?"
        items={[
          { text: "Essas informações são usadas nos documentos, assinaturas e como variáveis nos agentes de IA." },
          { text: "Configure o logo da sua empresa, dados de contato e informações legais para personalizar a experiência." },
          { text: "Mantenha essas informações sempre atualizadas para garantir a consistência em todos os documentos e comunicações." },
        ]}
        tip="As variáveis configuradas aqui podem ser usadas nos agentes de IA, templates de mensagem e documentos automáticos."
      />

      <Card>
        <CardHeader>
          <CardTitle>Logo da Empresa</CardTitle>
          <CardDescription>
            Faça upload do logo que será exibido no sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            <div className="w-24 h-24 rounded-xl border-2 border-dashed flex items-center justify-center bg-muted/50 overflow-hidden">
              {lawFirm?.logo_url ? (
                <img 
                  src={lawFirm.logo_url} 
                  alt="Logo" 
                  className="w-full h-full object-contain"
                />
              ) : (
                <Image className="h-8 w-8 text-muted-foreground" />
              )}
            </div>
            <div>
              <input
                type="file"
                ref={logoInputRef}
                onChange={handleLogoUpload}
                accept="image/*"
                className="hidden"
              />
              <Button 
                variant="outline" 
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploadingLogo ? "Enviando..." : "Alterar Logo"}
              </Button>
              <p className="text-sm text-muted-foreground mt-2">PNG, JPG ou SVG. Max 2MB.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <CardTitle>Dados da Empresa</CardTitle>
          </div>
          <CardDescription>
            Informações básicas da sua empresa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="office-name" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Nome do Escritório
                </Label>
                <Input 
                  id="office-name" 
                  placeholder="Nome da empresa" 
                  value={officeName}
                  onChange={(e) => setOfficeName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="office-phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Telefone 1
                </Label>
                <Input 
                  id="office-phone" 
                  placeholder="(11) 3000-0000" 
                  value={officePhone}
                  onChange={(e) => setOfficePhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="office-phone2" className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Telefone 2
                </Label>
                <Input 
                  id="office-phone2" 
                  placeholder="(11) 99999-9999" 
                  value={officePhone2}
                  onChange={(e) => setOfficePhone2(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="office-email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email
                </Label>
                <Input 
                  id="office-email" 
                  type="email" 
                  placeholder="contato@escritorio.com" 
                  value={officeEmail}
                  onChange={(e) => setOfficeEmail(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Legal Info */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground">Informações Legais</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="office-cnpj" className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  CNPJ (00.000.000/0000-00)
                </Label>
                <Input 
                  id="office-cnpj" 
                  placeholder="00.000.000/0001-00" 
                  value={officeCnpj}
                  onChange={(e) => setOfficeCnpj(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="oab-number" className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-muted-foreground" />
                  OAB (Ex: OAB/SP 123456)
                </Label>
                <Input 
                  id="oab-number" 
                  placeholder="OAB/SP 123456" 
                  value={oabNumber}
                  onChange={(e) => setOabNumber(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="office-address" className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                Endereço do Escritório
              </Label>
              <Textarea 
                id="office-address" 
                placeholder="Rua, número, bairro, cidade - UF" 
                value={officeAddress}
                onChange={(e) => setOfficeAddress(e.target.value)}
              />
            </div>
          </div>

          {/* Social Media */}
          <div className="space-y-4">
            <h4 className="font-semibold text-foreground">Redes Sociais</h4>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="instagram" className="flex items-center gap-2">
                  <Instagram className="h-4 w-4 text-muted-foreground" />
                  Instagram (@meuescritorio ou URL)
                </Label>
                <Input 
                  id="instagram" 
                  placeholder="@meuescritorio" 
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="facebook" className="flex items-center gap-2">
                  <Facebook className="h-4 w-4 text-muted-foreground" />
                  Facebook (URL completa)
                </Label>
                <Input 
                  id="facebook" 
                  placeholder="https://facebook.com/meuescritorio" 
                  value={facebook}
                  onChange={(e) => setFacebook(e.target.value)}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="website" className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Site (URL completa)
                </Label>
                <Input 
                  id="website" 
                  placeholder="https://www.meuescritorio.com.br" 
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
            </div>
          </div>
          
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
