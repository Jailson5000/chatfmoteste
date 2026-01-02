import { useState } from "react";
import { 
  ShoppingCart, 
  Plus, 
  Trash2, 
  RefreshCw, 
  Settings2, 
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Package,
  ShoppingBag,
  Ticket,
  Users,
  Truck,
  Star,
  Eye,
  Edit2
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger 
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { 
  useTrayCommerceConnections, 
  useTrayCommerceSync,
  useTrayCommerceProducts,
  useTrayCommerceOrders,
  useTrayCommerceCoupons,
  TrayCommerceConnection 
} from "@/hooks/useTrayCommerceIntegration";

function ConnectionStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "connected":
      return (
        <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Conectado
        </Badge>
      );
    case "disconnected":
      return (
        <Badge variant="secondary">
          <XCircle className="h-3 w-3 mr-1" />
          Desconectado
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Erro
        </Badge>
      );
    case "token_expired":
      return (
        <Badge variant="outline" className="text-amber-600 border-amber-500/20">
          <Clock className="h-3 w-3 mr-1" />
          Token expirado
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function AddConnectionDialog({ onConnect, isConnecting }: { 
  onConnect: (data: { store_name: string; store_url: string; consumer_key: string; consumer_secret: string; code?: string }) => Promise<void>;
  isConnecting: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [storeUrl, setStoreUrl] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [consumerSecret, setConsumerSecret] = useState("");
  const [code, setCode] = useState("");

  const handleSubmit = async () => {
    await onConnect({
      store_name: storeName,
      store_url: storeUrl,
      consumer_key: consumerKey,
      consumer_secret: consumerSecret,
      code: code || undefined,
    });
    setOpen(false);
    setStoreName("");
    setStoreUrl("");
    setConsumerKey("");
    setConsumerSecret("");
    setCode("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Conectar Loja
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Conectar Loja Tray</DialogTitle>
          <DialogDescription>
            Insira as credenciais da API da sua loja Tray Commerce.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="store_name">Nome da Loja</Label>
            <Input
              id="store_name"
              placeholder="Minha Loja"
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="store_url">URL da Loja</Label>
            <Input
              id="store_url"
              placeholder="https://minhaloja.tray.com.br"
              value={storeUrl}
              onChange={(e) => setStoreUrl(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="consumer_key">Consumer Key</Label>
            <Input
              id="consumer_key"
              placeholder="Sua consumer key"
              value={consumerKey}
              onChange={(e) => setConsumerKey(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="consumer_secret">Consumer Secret</Label>
            <Input
              id="consumer_secret"
              type="password"
              placeholder="Sua consumer secret"
              value={consumerSecret}
              onChange={(e) => setConsumerSecret(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Código de Autorização (opcional)</Label>
            <Input
              id="code"
              placeholder="Código recebido após autorização"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se você já possui um código de autorização da Tray, insira aqui.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isConnecting || !storeName || !storeUrl || !consumerKey || !consumerSecret}>
            {isConnecting ? "Conectando..." : "Conectar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectionCard({ 
  connection, 
  onToggle, 
  onDisconnect, 
  onUpdateSettings,
  isToggling,
  isDisconnecting 
}: { 
  connection: TrayCommerceConnection;
  onToggle: (connectionId: string, isActive: boolean) => Promise<void>;
  onDisconnect: (connectionId: string) => Promise<void>;
  onUpdateSettings: (connectionId: string, settings: Record<string, boolean>) => Promise<void>;
  isToggling: boolean;
  isDisconnecting: boolean;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [showData, setShowData] = useState(false);
  const syncState = connection.tray_commerce_sync_state?.[0];

  const { syncProducts, syncOrders, syncCoupons, isSyncingProducts, isSyncingOrders, isSyncingCoupons } = 
    useTrayCommerceSync(connection.id);

  const formatDate = (date: string | null) => {
    if (!date) return "Nunca";
    return format(new Date(date), "dd/MM/yyyy HH:mm", { locale: ptBR });
  };

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FF6B00] flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{connection.store_name}</CardTitle>
                {connection.is_default && (
                  <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                )}
              </div>
              <CardDescription className="flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                {connection.store_url}
              </CardDescription>
            </div>
          </div>
          <ConnectionStatusBadge status={connection.connection_status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Toggle Ativo */}
        <div className="flex items-center justify-between">
          <Label htmlFor={`active-${connection.id}`} className="text-sm">
            Integração ativa
          </Label>
          <Switch
            id={`active-${connection.id}`}
            checked={connection.is_active}
            onCheckedChange={(checked) => onToggle(connection.id, checked)}
            disabled={isToggling || connection.connection_status !== "connected"}
          />
        </div>

        {/* Sync Stats */}
        {syncState && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Package className="h-4 w-4" />
              <span>{syncState.products_synced_count} produtos</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <ShoppingBag className="h-4 w-4" />
              <span>{syncState.orders_synced_count} pedidos</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Ticket className="h-4 w-4" />
              <span>{syncState.coupons_synced_count} cupons</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Webhook: {formatDate(syncState.last_webhook_at)}</span>
            </div>
          </div>
        )}

        <Separator />

        {/* Sync Buttons */}
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => syncProducts()}
            disabled={!connection.is_active || isSyncingProducts || !connection.sync_products}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isSyncingProducts ? 'animate-spin' : ''}`} />
            Produtos
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => syncOrders()}
            disabled={!connection.is_active || isSyncingOrders || !connection.sync_orders}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isSyncingOrders ? 'animate-spin' : ''}`} />
            Pedidos
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => syncCoupons()}
            disabled={!connection.is_active || isSyncingCoupons || !connection.sync_coupons}
          >
            <RefreshCw className={`h-3 w-3 mr-1 ${isSyncingCoupons ? 'animate-spin' : ''}`} />
            Cupons
          </Button>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowData(!showData)}>
              <Eye className="h-4 w-4 mr-1" />
              Dados
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowSettings(!showSettings)}>
              <Settings2 className="h-4 w-4 mr-1" />
              Configurar
            </Button>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Desconectar loja?</AlertDialogTitle>
                <AlertDialogDescription>
                  Isso irá remover a conexão com {connection.store_name}. Os dados sincronizados serão mantidos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDisconnect(connection.id)}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDisconnecting ? "Desconectando..." : "Desconectar"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
            <h4 className="font-medium text-sm">Configurações de Sincronização</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center justify-between">
                <Label htmlFor={`sync-products-${connection.id}`} className="text-sm flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Produtos
                </Label>
                <Switch
                  id={`sync-products-${connection.id}`}
                  checked={connection.sync_products}
                  onCheckedChange={(checked) => onUpdateSettings(connection.id, { sync_products: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor={`sync-orders-${connection.id}`} className="text-sm flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  Pedidos
                </Label>
                <Switch
                  id={`sync-orders-${connection.id}`}
                  checked={connection.sync_orders}
                  onCheckedChange={(checked) => onUpdateSettings(connection.id, { sync_orders: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor={`sync-customers-${connection.id}`} className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Clientes
                </Label>
                <Switch
                  id={`sync-customers-${connection.id}`}
                  checked={connection.sync_customers}
                  onCheckedChange={(checked) => onUpdateSettings(connection.id, { sync_customers: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor={`sync-coupons-${connection.id}`} className="text-sm flex items-center gap-2">
                  <Ticket className="h-4 w-4" />
                  Cupons
                </Label>
                <Switch
                  id={`sync-coupons-${connection.id}`}
                  checked={connection.sync_coupons}
                  onCheckedChange={(checked) => onUpdateSettings(connection.id, { sync_coupons: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor={`sync-shipping-${connection.id}`} className="text-sm flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  Frete
                </Label>
                <Switch
                  id={`sync-shipping-${connection.id}`}
                  checked={connection.sync_shipping}
                  onCheckedChange={(checked) => onUpdateSettings(connection.id, { sync_shipping: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor={`read-only-${connection.id}`} className="text-sm flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Somente leitura
                </Label>
                <Switch
                  id={`read-only-${connection.id}`}
                  checked={connection.read_only_mode}
                  onCheckedChange={(checked) => onUpdateSettings(connection.id, { read_only_mode: checked })}
                />
              </div>
            </div>
            {!connection.is_default && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onUpdateSettings(connection.id, { is_default: true })}
              >
                <Star className="h-4 w-4 mr-2" />
                Definir como padrão
              </Button>
            )}
          </div>
        )}

        {/* Data Panel */}
        {showData && (
          <ConnectionDataPanel connectionId={connection.id} />
        )}
      </CardContent>
    </Card>
  );
}

function ConnectionDataPanel({ connectionId }: { connectionId: string }) {
  const [activeTab, setActiveTab] = useState("products");
  const { data: productsData, isLoading: loadingProducts } = useTrayCommerceProducts(connectionId);
  const { data: ordersData, isLoading: loadingOrders } = useTrayCommerceOrders(connectionId);
  const { data: coupons, isLoading: loadingCoupons } = useTrayCommerceCoupons(connectionId);

  return (
    <div className="border rounded-lg p-4 bg-muted/30">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="products">Produtos</TabsTrigger>
          <TabsTrigger value="orders">Pedidos</TabsTrigger>
          <TabsTrigger value="coupons">Cupons</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="mt-4">
          {loadingProducts ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {productsData?.data.map((product) => (
                <div key={product.id} className="flex items-center justify-between p-2 bg-background rounded">
                  <div>
                    <p className="font-medium text-sm">{product.name}</p>
                    <p className="text-xs text-muted-foreground">SKU: {product.sku || "-"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-sm">R$ {product.price?.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">Estoque: {product.stock}</p>
                  </div>
                </div>
              ))}
              {productsData?.data.length === 0 && (
                <p className="text-center text-muted-foreground py-4">Nenhum produto sincronizado</p>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          {loadingOrders ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {ordersData?.data.map((order) => (
                <div key={order.id} className="flex items-center justify-between p-2 bg-background rounded">
                  <div>
                    <p className="font-medium text-sm">Pedido #{order.order_number}</p>
                    <p className="text-xs text-muted-foreground">{order.customer_name || "-"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-sm">R$ {order.total?.toFixed(2)}</p>
                    <Badge variant="outline" className="text-xs">{order.tray_status}</Badge>
                  </div>
                </div>
              ))}
              {ordersData?.data.length === 0 && (
                <p className="text-center text-muted-foreground py-4">Nenhum pedido sincronizado</p>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="coupons" className="mt-4">
          {loadingCoupons ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {coupons?.map((coupon) => (
                <div key={coupon.id} className="flex items-center justify-between p-2 bg-background rounded">
                  <div>
                    <p className="font-medium text-sm">{coupon.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {coupon.discount_type === "percent" ? `${coupon.discount_value}%` : `R$ ${coupon.discount_value}`}
                    </p>
                  </div>
                  <Badge variant={coupon.is_active ? "default" : "secondary"}>
                    {coupon.is_active ? "Ativo" : "Inativo"}
                  </Badge>
                </div>
              ))}
              {coupons?.length === 0 && (
                <p className="text-center text-muted-foreground py-4">Nenhum cupom sincronizado</p>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function TrayCommerceIntegration() {
  const { 
    connections, 
    isLoading, 
    connect, 
    isConnecting, 
    disconnect, 
    isDisconnecting,
    toggle,
    isToggling,
    updateSettings
  } = useTrayCommerceConnections();

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FF6B00] flex items-center justify-center">
              <ShoppingCart className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle>Tray Commerce</CardTitle>
              <CardDescription>
                Integre pedidos, produtos, cupons e frete do seu e-commerce Tray
              </CardDescription>
            </div>
          </div>
          <AddConnectionDialog onConnect={connect} isConnecting={isConnecting} />
        </div>
      </CardHeader>
      <CardContent>
        {connections.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Nenhuma loja conectada</p>
            <p className="text-sm">Clique em "Conectar Loja" para começar</p>
          </div>
        ) : (
          <div className="space-y-4">
            {connections.map((connection) => (
              <ConnectionCard
                key={connection.id}
                connection={connection}
                onToggle={toggle}
                onDisconnect={disconnect}
                onUpdateSettings={(id, settings) => updateSettings({ connectionId: id, settings })}
                isToggling={isToggling}
                isDisconnecting={isDisconnecting}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
