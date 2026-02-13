import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Instagram, Facebook, MessageCircle, CheckCircle2, XCircle, Copy, PlayCircle, Send, Save, FileText, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { META_APP_ID, META_GRAPH_API_VERSION } from "@/lib/meta-config";
import { useQuery } from "@tanstack/react-query";
import { WhatsAppTemplatesManager } from "@/components/connections/WhatsAppTemplatesManager";

interface TestResult {
  status: "idle" | "loading" | "success" | "error";
  data?: any;
  error?: string;
}

interface PermissionTest {
  key: string;
  permission: string;
  endpoint: string;
  required: boolean;
}

export default function MetaTestPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [results, setResults] = useState<Record<string, TestResult>>({});

  // Test connection form state
  const [testToken, setTestToken] = useState("");
  const [testPhoneNumberId, setTestPhoneNumberId] = useState("920102187863212");
  const [testWabaId, setTestWabaId] = useState("1243984223971997");
  const [savingConnection, setSavingConnection] = useState(false);

  // Test message form state
  const [recipientPhone, setRecipientPhone] = useState("5563984622450");
  const [testMessage, setTestMessage] = useState("Mensagem de teste do MiauChat");
  const [sendingTemplate, setSendingTemplate] = useState(false);
  const [sendingText, setSendingText] = useState(false);
  const [sendResult, setSendResult] = useState<TestResult>({ status: "idle" });

  const { data: connections, refetch: refetchConnections } = useQuery({
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

  const igConnection = connections?.find((c: any) => c.type === "instagram");
  const fbConnection = connections?.find((c: any) => c.type === "facebook");
  const waConnection = connections?.find((c: any) => c.type === "whatsapp_cloud");

  const setTestResult = (key: string, result: TestResult) => {
    setResults((prev) => ({ ...prev, [key]: result }));
  };

  const callMetaApi = useCallback(async (key: string, endpoint: string, connection: any) => {
    setTestResult(key, { status: "loading" });
    try {
      const { data, error } = await supabase.functions.invoke("meta-api", {
        body: { action: "test_api", connectionId: connection.id, endpoint },
      });
      if (error) throw error;
      if (data?.error) {
        const errMsg = typeof data.error === 'object' 
          ? JSON.stringify(data.error, null, 2) 
          : String(data.error);
        setTestResult(key, { status: "error", error: errMsg });
        return;
      }
      setTestResult(key, { status: "success", data });
    } catch (err: any) {
      setTestResult(key, { status: "error", error: err.message });
    }
  }, []);

  const getResult = (key: string): TestResult => results[key] || { status: "idle" };

  const runAllTests = async (tests: PermissionTest[], connection: any) => {
    if (!connection) return;
    for (const t of tests) {
      await callMetaApi(t.key, t.endpoint, connection);
    }
    toast.success("Todos os testes da seção concluídos!");
  };

  const copyJson = (data: any) => {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    toast.success("JSON copiado!");
  };

  // Save test connection
  const handleSaveTestConnection = async () => {
    if (!testToken.trim()) {
      toast.error("Cole o token temporário do painel da Meta");
      return;
    }
    setSavingConnection(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-api", {
        body: {
          action: "save_test_connection",
          accessToken: testToken.trim(),
          phoneNumberId: testPhoneNumberId.trim(),
          wabaId: testWabaId.trim(),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Conexão salva! ID: ${data.connectionId}`);
      refetchConnections();
    } catch (err: any) {
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSavingConnection(false);
    }
  };

  // Send test message
  const handleSendTestMessage = async (useTemplate: boolean) => {
    if (!waConnection) {
      toast.error("Salve a conexão de teste primeiro");
      return;
    }
    if (!recipientPhone.trim()) {
      toast.error("Informe o número de destino");
      return;
    }

    useTemplate ? setSendingTemplate(true) : setSendingText(true);
    setSendResult({ status: "loading" });

    try {
      const { data, error } = await supabase.functions.invoke("meta-api", {
        body: {
          action: "send_test_message",
          connectionId: (waConnection as any).id,
          recipientPhone: recipientPhone.trim(),
          message: testMessage.trim(),
          useTemplate,
          templateName: "hello_world",
          templateLang: "en_US",
        },
      });
      if (error) throw error;
      if (data?.error) {
        setSendResult({ status: "error", error: JSON.stringify(data.error, null, 2) });
        toast.error("Erro ao enviar mensagem");
      } else {
        const msgId = data?.messages?.[0]?.id || data?.message_id || "OK";
        setSendResult({ status: "success", data });
        toast.success(`Mensagem enviada! ID: ${msgId}`);
      }
    } catch (err: any) {
      setSendResult({ status: "error", error: err.message });
      toast.error(`Erro: ${err.message}`);
    } finally {
      setSendingTemplate(false);
      setSendingText(false);
    }
  };

  // Build dynamic endpoints
  const fbPageId = (fbConnection as any)?.page_id || "PAGE_ID";
  const fbIgAccountId = (fbConnection as any)?.ig_account_id || "IG_ID";
  const igPageId = (igConnection as any)?.page_id || "PAGE_ID";
  const igAccountId = (igConnection as any)?.ig_account_id || "IG_ID";
  const waPhoneId = (waConnection as any)?.page_id || "PHONE_ID";
  const wabaIdVal = (waConnection as any)?.waba_id || "WABA_ID";

  const messengerTests: PermissionTest[] = [
    { key: "msg_pages_utility", permission: "pages_utility_messaging", endpoint: `/${fbPageId}/conversations?limit=3`, required: true },
    { key: "msg_pages_metadata", permission: "pages_manage_metadata", endpoint: `/me/accounts?fields=id,name,category`, required: true },
    { key: "msg_public_profile", permission: "public_profile", endpoint: `/me?fields=id,name`, required: true },
    { key: "msg_pages_messaging", permission: "pages_messaging", endpoint: `/${fbPageId}/conversations?limit=3`, required: true },
    { key: "msg_ig_messages", permission: "instagram_manage_messages", endpoint: `/${fbPageId}/conversations?platform=instagram&limit=3`, required: true },
    { key: "msg_pages_show", permission: "pages_show_list", endpoint: `/me/accounts?fields=id,name`, required: true },
    { key: "msg_ig_basic", permission: "instagram_basic", endpoint: `/${fbIgAccountId}?fields=id,username`, required: true },
    { key: "msg_business", permission: "business_management", endpoint: `/me/businesses?limit=3`, required: true },
  ];

  const instagramTests: PermissionTest[] = [
    { key: "ig_manage_messages", permission: "instagram_business_manage_messages", endpoint: `/${igAccountId}/conversations?platform=instagram&limit=3`, required: true },
    { key: "ig_business_basic", permission: "instagram_business_basic", endpoint: `/me?fields=id,name,username,profile_picture_url`, required: true },
    { key: "ig_public_profile", permission: "public_profile", endpoint: `/me?fields=id,name`, required: true },
    { key: "ig_manage_comments", permission: "instagram_manage_comments", endpoint: `/${igAccountId}/media?limit=3&fields=id,comments_count`, required: true },
    { key: "ig_messages", permission: "instagram_manage_messages", endpoint: `/${igPageId}/conversations?platform=instagram&limit=3`, required: true },
    { key: "ig_pages_show", permission: "pages_show_list", endpoint: `/me/accounts?fields=id,name`, required: true },
    { key: "ig_basic", permission: "instagram_basic", endpoint: `/${igAccountId}?fields=id,username`, required: true },
    { key: "ig_business", permission: "business_management", endpoint: `/me/businesses?limit=3`, required: true },
  ];

  const whatsappTests: PermissionTest[] = [
    { key: "wa_messaging", permission: "whatsapp_business_messaging", endpoint: `/${waPhoneId}?fields=verified_name,display_phone_number`, required: true },
    { key: "wa_public_profile", permission: "public_profile", endpoint: `/me?fields=id,name`, required: true },
    { key: "wa_management", permission: "whatsapp_business_management", endpoint: `/${wabaIdVal}/phone_numbers`, required: true },
    { key: "wa_business", permission: "business_management", endpoint: `/me/businesses?limit=3`, required: true },
  ];

  const sectionSuccessCount = (tests: PermissionTest[]) => {
    const success = tests.filter((t) => getResult(t.key).status === "success").length;
    return `${success}/${tests.length}`;
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
        <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-40 whitespace-pre-wrap">
          {r.status === "success" ? JSON.stringify(r.data, null, 2) : r.error}
        </pre>
      </div>
    );
  };

  const TestSection = ({
    title,
    icon,
    connection,
    tests,
    connectionLabel,
  }: {
    title: string;
    icon: React.ReactNode;
    connection: any;
    tests: PermissionTest[];
    connectionLabel?: string;
  }) => {
    const isRunningAll = tests.some((t) => getResult(t.key).status === "loading");
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            {icon}
            {title}
            <Badge variant="outline" className="ml-auto">{sectionSuccessCount(tests)}</Badge>
            {connection ? (
              <Badge variant="default" className="bg-green-600">{connectionLabel || connection.page_name}</Badge>
            ) : (
              <Badge variant="secondary">Não conectado</Badge>
            )}
          </CardTitle>
          <div className="pt-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!connection || isRunningAll}
              onClick={() => runAllTests(tests, connection)}
            >
              {isRunningAll ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <PlayCircle className="h-3 w-3 mr-1" />}
              Testar Todos
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {tests.map((t) => (
            <div key={t.key} className="border-b pb-3 last:border-0 last:pb-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{t.permission}</p>
                {t.required && <Badge variant="outline" className="text-xs">Obrigatória</Badge>}
                {getResult(t.key).status === "success" && <CheckCircle2 className="h-4 w-4 text-green-600 ml-auto" />}
                {getResult(t.key).status === "error" && <XCircle className="h-4 w-4 text-destructive ml-auto" />}
              </div>
              <p className="text-xs text-muted-foreground mb-2 font-mono">GET {t.endpoint}</p>
              <Button
                size="sm"
                disabled={!connection || getResult(t.key).status === "loading"}
                onClick={() => callMetaApi(t.key, t.endpoint, connection)}
              >
                {getResult(t.key).status === "loading" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                Testar
              </Button>
              <ResultDisplay testKey={t.key} />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meta API Test Console</h1>
        <p className="text-muted-foreground mt-1">
          Teste cada permissão por caso de uso para gravação do vídeo de App Review.
        </p>
        <div className="flex gap-2 mt-2">
          <Badge variant="outline">App ID: {META_APP_ID}</Badge>
          <Badge variant="outline">API: {META_GRAPH_API_VERSION}</Badge>
        </div>
      </div>

      {/* ===== SEÇÃO: Conexão Manual de Teste ===== */}
      <Card className="border-2 border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Save className="h-5 w-5" />
            1. Conexão Manual de Teste (WhatsApp Cloud)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Cole o token temporário do painel Meta Developer &gt; WhatsApp &gt; Configuração da API.
            Os valores de Phone Number ID e WABA ID já estão preenchidos com o número de teste da Meta.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="testToken">Token Temporário (Access Token)</Label>
            <Textarea
              id="testToken"
              placeholder="EAARlzIjg37wBO..."
              value={testToken}
              onChange={(e) => setTestToken(e.target.value)}
              rows={3}
              className="font-mono text-xs"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumberId">Phone Number ID</Label>
              <Input
                id="phoneNumberId"
                value={testPhoneNumberId}
                onChange={(e) => setTestPhoneNumberId(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wabaId">WABA ID</Label>
              <Input
                id="wabaId"
                value={testWabaId}
                onChange={(e) => setTestWabaId(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
          <Button onClick={handleSaveTestConnection} disabled={savingConnection || !testToken.trim()}>
            {savingConnection ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar Conexão de Teste
          </Button>
          {waConnection && (
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-green-600 font-medium">Conexão WhatsApp Cloud ativa</span>
              <span className="text-muted-foreground">({(waConnection as any).page_id})</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== SEÇÃO: Envio de Mensagem de Teste ===== */}
      <Card className="border-2 border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            2. Envio de Mensagem de Teste
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Envie uma mensagem para demonstrar a capacidade de envio.
            A primeira mensagem deve ser um <strong>template</strong> (hello_world). 
            Após o destinatário responder, você pode enviar texto livre na janela de 24h.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recipientPhone">Número de Destino (com código do país)</Label>
            <Input
              id="recipientPhone"
              placeholder="5511999999999"
              value={recipientPhone}
              onChange={(e) => setRecipientPhone(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="testMsg">Mensagem (para texto livre)</Label>
            <Textarea
              id="testMsg"
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              rows={2}
            />
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => handleSendTestMessage(true)}
              disabled={sendingTemplate || !waConnection}
              variant="default"
            >
              {sendingTemplate ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar Template hello_world
            </Button>
            <Button
              onClick={() => handleSendTestMessage(false)}
              disabled={sendingText || !waConnection}
              variant="outline"
            >
              {sendingText ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar Texto Livre
            </Button>
          </div>
          {!waConnection && (
            <p className="text-sm text-amber-600">⚠️ Salve a conexão de teste primeiro (passo 1)</p>
          )}
          {sendResult.status !== "idle" && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                {sendResult.status === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
                {sendResult.status === "success" && (
                  <Badge variant="default" className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" /> Enviado</Badge>
                )}
                {sendResult.status === "error" && (
                  <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" /> Erro</Badge>
                )}
                {sendResult.data && (
                  <Button variant="ghost" size="sm" onClick={() => copyJson(sendResult.data)}>
                    <Copy className="h-3 w-3 mr-1" /> Copiar
                  </Button>
                )}
              </div>
              <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-40 whitespace-pre-wrap">
                {sendResult.status === "success"
                  ? JSON.stringify(sendResult.data, null, 2)
                  : sendResult.error}
              </pre>
              {sendResult.status === "success" && sendResult.data?.conversationId && (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  onClick={() => navigate(`/conversations?id=${sendResult.data.conversationId}`)}
                >
                  <ExternalLink className="h-3 w-3 mr-1" /> Ver conversa
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ===== SEÇÃO: Templates (para App Review whatsapp_business_management) ===== */}
      <Card className="border-2 border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            3. Gerenciamento de Templates (whatsapp_business_management)
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Crie, liste e exclua templates de mensagem. Use esta seção para o vídeo do App Review 
            da permissão <strong>whatsapp_business_management</strong>.
          </p>
        </CardHeader>
        <CardContent>
          {waConnection ? (
            <WhatsAppTemplatesManager connectionId={(waConnection as any).id} />
          ) : (
            <p className="text-sm text-amber-600">⚠️ Salve a conexão de teste primeiro (passo 1)</p>
          )}
        </CardContent>
      </Card>

      {/* ===== Seções de teste de permissões existentes ===== */}
      <TestSection
        title="Caso de Uso 1: Messenger"
        icon={<Facebook className="h-5 w-5" />}
        connection={fbConnection}
        tests={messengerTests}
        connectionLabel={fbConnection?.page_name}
      />

      <TestSection
        title="Caso de Uso 2: Instagram"
        icon={<Instagram className="h-5 w-5" />}
        connection={igConnection}
        tests={instagramTests}
        connectionLabel={igConnection?.page_name}
      />

      <TestSection
        title="Caso de Uso 3: WhatsApp"
        icon={<MessageCircle className="h-5 w-5" />}
        connection={waConnection}
        tests={whatsappTests}
        connectionLabel={waConnection?.page_name}
      />

      {/* Raw Data */}
      <Card>
        <CardHeader>
          <CardTitle>Conexões Raw Data</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-60 whitespace-pre-wrap">
            {JSON.stringify(connections?.map((c: any) => ({
              type: c.type, page_name: c.page_name, page_id: c.page_id,
              ig_account_id: c.ig_account_id, waba_id: c.waba_id,
              is_active: c.is_active, token_expires_at: c.token_expires_at,
            })), null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
