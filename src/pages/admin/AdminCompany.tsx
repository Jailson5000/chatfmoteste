import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building2, Save, Upload } from "lucide-react";
import { useLawFirm } from "@/hooks/useLawFirm";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function AdminCompany() {
  const { lawFirm, updateLawFirm } = useLawFirm();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    document: "",
    address: "",
  });

  useEffect(() => {
    if (lawFirm) {
      setFormData({
        name: lawFirm.name || "",
        email: lawFirm.email || "",
        phone: lawFirm.phone || "",
        document: lawFirm.document || "",
        address: lawFirm.address || "",
      });
    }
  }, [lawFirm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lawFirm?.id) return;

    setLoading(true);
    try {
      await updateLawFirm.mutateAsync({
        name: formData.name,
        email: formData.email || null,
        phone: formData.phone || null,
        document: formData.document || null,
        address: formData.address || null,
      });

      toast.success("Dados da empresa atualizados");
      queryClient.invalidateQueries({ queryKey: ["law_firm"] });
    } catch (error) {
      console.error("Error updating company:", error);
      toast.error("Erro ao atualizar dados da empresa");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dados da Empresa</h1>
        <p className="text-muted-foreground">
          Atualize as informações da sua empresa
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* Logo Card */}
        <Card>
          <CardHeader>
            <CardTitle>Logo</CardTitle>
            <CardDescription>
              Imagem exibida na plataforma
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <Avatar className="h-24 w-24">
              <AvatarImage src={lawFirm?.logo_url || undefined} />
              <AvatarFallback>
                <Building2 className="h-12 w-12 text-muted-foreground" />
              </AvatarFallback>
            </Avatar>
            <Button variant="outline" size="sm" disabled className="gap-2">
              <Upload className="h-4 w-4" />
              Alterar Logo
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              JPG, PNG ou SVG. Máximo 2MB.
            </p>
          </CardContent>
        </Card>

        {/* Form Card */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Informações Gerais</CardTitle>
            <CardDescription>
              Dados cadastrais da empresa
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Empresa *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="document">CNPJ/CPF</Label>
                  <Input
                    id="document"
                    value={formData.document}
                    onChange={(e) => handleChange("document", e.target.value)}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleChange("email", e.target.value)}
                    placeholder="contato@empresa.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="document">CNPJ/CPF</Label>
                  <Input
                    id="document"
                    value={formData.document}
                    onChange={(e) => handleChange("document", e.target.value)}
                    placeholder="00.000.000/0000-00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Endereço</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => handleChange("address", e.target.value)}
                    placeholder="Rua, número, bairro, cidade - UF"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={loading} className="gap-2">
                  <Save className="h-4 w-4" />
                  {loading ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
