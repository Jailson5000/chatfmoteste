import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Instagram, Facebook, MessageCircle, CheckCircle2, XCircle, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { META_APP_ID, META_GRAPH_API_VERSION } from "@/lib/meta-config";
import { useQuery } from "@tanstack/react-query";

interface TestResult {
  status: "idle" | "loading" | "success" | "error";
  data?: any;
  error?: string;
}

export default function MetaTestPage() {
  const { user } = useAuth();
  const [results, setResults] = useState<Record<string, TestResult>>({});

  // Fetch all meta connections for this tenant
  const { data: connections } = useQuery({
    queryKey: ["meta-connections-test", user?.id],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("law_firm_id")
        .eq("id", user?.id)
        .single();
      if (!profile?.law_firm_id) return [];

      const { data } = await supabase
        .from("meta_connections")
        .select("*")
        .eq("law_firm_id", profile.law_firm_id);
      return data || [];
    },
    enabled: !!user?.id,
  });

  const setTestResult = (key: string, result: TestResult) => {
    setResults((prev) => ({ ...prev, [key]: result }));
  };

  const callMetaApi = async (key: string, endpoint: string, connection: any) => {
    setTestResult(key, { status: "loading" });
    try {
      // We call the Graph API via the meta-api edge function proxy or directly
      // For test purposes, we use the edge function to decrypt tokens
      const { data, error } = await supabase.functions.invoke("meta-api", {
        body: {
          action: "test_api",
          connectionId: connection.id,
          endpoint,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTestResult(key, { status: "success", data });
    } catch (err: any) {
      setTestResult(key, { status: "error", error: err.message });
    }
  };

  const getResult = (key: string): TestResult => results[key] || { status: "idle" };

  const igConnection = connections?.find((c: any) => c.type === "instagram");
  const fbConnection = connections?.find((c: any) => c.type === "facebook");
  const waConnection = connections?.find((c: any) => c.type === "whatsapp_cloud");

  const copyJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast.success("JSON copiado!");
  };

  const ResultDisplay = ({ testKey }: { testKey: string }) => {
    const r = getResult(testKey);
    if (r.status === "idle") return null;
    if (r.status === "loading") return <Loader2 className="h-4 w-4 animate-spin mt-2" />;
    return (
      <div className="mt-3 space-y-2">
        <div className="flex items-center gap-2">
          {r.status === "success" ? (
            <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Sucesso</Badge>
          ) : (
            <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Erro</Badge>
          )}
          {r.data && (
            <Button variant="ghost" size="sm" onClick={() => copyJson(r.data)}>
              <Copy className="h-3 w-3 mr-1" /> Copiar
            </Button>
          )}
        </div>
        <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-60 whitespace-pre-wrap">
          {r.status === "success" ? JSON.stringify(r.data, null, 2) : r.error}
        </pre>
      </div>
    );
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meta API Test Console</h1>
        <p className="text-muted-foreground mt-1">
          Teste cada permissão da Meta para gravação do vídeo de App Review.
        </p>
        <Badge variant="outline" className="mt-2">App ID: {META_APP_ID}</Badge>
        <Badge variant="outline" className="ml-2">API: {META_GRAPH_API_VERSION}</Badge>
      </div>

      {/* Instagram */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5" />
            Instagram Business
            {igConnection ? (
              <Badge variant="default" className="bg-green-600 ml-auto">Conectado: {igConnection.page_name}</Badge>
            ) : (
              <Badge variant="secondary" className="ml-auto">Não conectado</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">instagram_business_basic</p>
            <p className="text-xs text-muted-foreground mb-2">GET /me?fields=id,name,username,profile_picture_url</p>
            <Button
              size="sm"
              disabled={!igConnection || getResult("ig_basic").status === "loading"}
              onClick={() => callMetaApi("ig_basic", "/me?fields=id,name,username,profile_picture_url", igConnection)}
            >
              {getResult("ig_basic").status === "loading" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Testar
            </Button>
            <ResultDisplay testKey="ig_basic" />
          </div>

          <div>
            <p className="text-sm font-medium">instagram_business_manage_messages</p>
            <p className="text-xs text-muted-foreground mb-2">GET /me/conversations?platform=instagram</p>
            <Button
              size="sm"
              disabled={!igConnection || getResult("ig_messages").status === "loading"}
              onClick={() => callMetaApi("ig_messages", "/me/conversations?platform=instagram&limit=3", igConnection)}
            >
              {getResult("ig_messages").status === "loading" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Testar
            </Button>
            <ResultDisplay testKey="ig_messages" />
          </div>

          <div>
            <p className="text-sm font-medium">instagram_business_content_publish</p>
            <p className="text-xs text-muted-foreground mb-2">GET /me/media?limit=3</p>
            <Button
              size="sm"
              disabled={!igConnection || getResult("ig_content").status === "loading"}
              onClick={() => callMetaApi("ig_content", "/me/media?limit=3", igConnection)}
            >
              {getResult("ig_content").status === "loading" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Testar
            </Button>
            <ResultDisplay testKey="ig_content" />
          </div>

          <div>
            <p className="text-sm font-medium">instagram_business_manage_insights</p>
            <p className="text-xs text-muted-foreground mb-2">GET /me/insights?metric=impressions&period=day</p>
            <Button
              size="sm"
              disabled={!igConnection || getResult("ig_insights").status === "loading"}
              onClick={() => callMetaApi("ig_insights", "/me/insights?metric=impressions&period=day", igConnection)}
            >
              {getResult("ig_insights").status === "loading" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Testar
            </Button>
            <ResultDisplay testKey="ig_insights" />
          </div>
        </CardContent>
      </Card>

      {/* Facebook */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Facebook className="h-5 w-5" />
            Facebook Messenger
            {fbConnection ? (
              <Badge variant="default" className="bg-green-600 ml-auto">Conectado: {fbConnection.page_name}</Badge>
            ) : (
              <Badge variant="secondary" className="ml-auto">Não conectado</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">pages_manage_metadata</p>
            <p className="text-xs text-muted-foreground mb-2">GET /me/accounts?fields=id,name,access_token</p>
            <Button
              size="sm"
              disabled={!fbConnection || getResult("fb_pages").status === "loading"}
              onClick={() => callMetaApi("fb_pages", "/me/accounts?fields=id,name,category", fbConnection)}
            >
              {getResult("fb_pages").status === "loading" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Testar
            </Button>
            <ResultDisplay testKey="fb_pages" />
          </div>

          <div>
            <p className="text-sm font-medium">pages_messaging</p>
            <p className="text-xs text-muted-foreground mb-2">GET /me/conversations?platform=messenger&limit=3</p>
            <Button
              size="sm"
              disabled={!fbConnection || getResult("fb_messaging").status === "loading"}
              onClick={() => callMetaApi("fb_messaging", "/me/conversations?limit=3", fbConnection)}
            >
              {getResult("fb_messaging").status === "loading" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Testar
            </Button>
            <ResultDisplay testKey="fb_messaging" />
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp Cloud */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            WhatsApp Cloud API
            {waConnection ? (
              <Badge variant="default" className="bg-green-600 ml-auto">Conectado: {waConnection.page_name}</Badge>
            ) : (
              <Badge variant="secondary" className="ml-auto">Não conectado</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium">whatsapp_business_management</p>
            <p className="text-xs text-muted-foreground mb-2">GET /WABA_ID/phone_numbers</p>
            <Button
              size="sm"
              disabled={!waConnection || getResult("wa_phones").status === "loading"}
              onClick={() => {
                const wabaId = (waConnection as any)?.waba_id;
                callMetaApi("wa_phones", `/${wabaId}/phone_numbers`, waConnection);
              }}
            >
              {getResult("wa_phones").status === "loading" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Testar
            </Button>
            <ResultDisplay testKey="wa_phones" />
          </div>

          <div>
            <p className="text-sm font-medium">whatsapp_business_messaging</p>
            <p className="text-xs text-muted-foreground mb-2">GET /PHONE_NUMBER_ID (verifica número)</p>
            <Button
              size="sm"
              disabled={!waConnection || getResult("wa_number").status === "loading"}
              onClick={() => {
                const phoneId = (waConnection as any)?.page_id;
                callMetaApi("wa_number", `/${phoneId}?fields=verified_name,display_phone_number,quality_rating`, waConnection);
              }}
            >
              {getResult("wa_number").status === "loading" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              Testar
            </Button>
            <ResultDisplay testKey="wa_number" />
          </div>
        </CardContent>
      </Card>

      {/* Connection Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Conexões Raw Data</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-60 whitespace-pre-wrap">
            {JSON.stringify(connections?.map((c: any) => ({
              type: c.type,
              page_name: c.page_name,
              page_id: c.page_id,
              ig_account_id: c.ig_account_id,
              waba_id: c.waba_id,
              is_active: c.is_active,
              token_expires_at: c.token_expires_at,
            })), null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
