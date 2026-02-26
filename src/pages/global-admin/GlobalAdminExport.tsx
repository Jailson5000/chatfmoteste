import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Database, Download, Loader2, CheckCircle2, AlertCircle, Archive, Users, HardDrive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import JSZip from "jszip";

interface TableInfo {
  name: string;
  count: number;
  status: "pending" | "exporting" | "done" | "error";
}

interface InternalInfo {
  authUsersCount: number;
  storageBuckets: { name: string; id: string; objectCount: number }[];
}

export default function GlobalAdminExport() {
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [internal, setInternal] = useState<InternalInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTable, setCurrentTable] = useState("");
  const [zipBlob, setZipBlob] = useState<Blob | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [authStatus, setAuthStatus] = useState<"pending" | "exporting" | "done" | "error">("pending");
  const [storageStatus, setStorageStatus] = useState<"pending" | "exporting" | "done" | "error">("pending");

  const loadTables = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("export-database", {
        body: { action: "list" },
      });

      if (error) throw error;

      const tableList: TableInfo[] = (data.tables as string[]).map((name: string) => ({
        name,
        count: data.counts[name] ?? 0,
        status: "pending" as const,
      }));

      tableList.sort((a, b) => a.name.localeCompare(b.name));
      setTables(tableList);
      setZipBlob(null);

      if (data.internal) {
        setInternal({
          authUsersCount: data.internal.auth_users ?? 0,
          storageBuckets: data.internal.storage_buckets ?? [],
        });
      }
    } catch (err: any) {
      toast.error("Erro ao listar tabelas: " + (err.message || "Erro desconhecido"));
    } finally {
      setLoading(false);
    }
  }, []);

  const exportAll = useCallback(async () => {
    if (tables.length === 0) return;

    setExporting(true);
    setProgress(0);
    setZipBlob(null);
    setTotalRows(0);
    setAuthStatus("pending");
    setStorageStatus("pending");

    const zip = new JSZip();
    let completed = 0;
    let rowsTotal = 0;
    const totalSteps = tables.length + (internal ? 2 : 0);

    setTables((prev) => prev.map((t) => ({ ...t, status: "pending" })));

    // Export public tables
    for (const table of tables) {
      setCurrentTable(table.name);
      setTables((prev) =>
        prev.map((t) => (t.name === table.name ? { ...t, status: "exporting" } : t))
      );

      try {
        const { data, error } = await supabase.functions.invoke("export-database", {
          body: { action: "export", table: table.name },
        });

        if (error) throw error;

        const rows = data.rows || [];
        rowsTotal += rows.length;
        zip.file(`${table.name}.json`, JSON.stringify(rows, null, 2));

        setTables((prev) =>
          prev.map((t) =>
            t.name === table.name ? { ...t, status: "done", count: rows.length } : t
          )
        );
      } catch (err: any) {
        console.error(`Error exporting ${table.name}:`, err);
        setTables((prev) =>
          prev.map((t) => (t.name === table.name ? { ...t, status: "error" } : t))
        );
      }

      completed++;
      setProgress(Math.round((completed / totalSteps) * 100));
    }

    // Export auth users
    if (internal) {
      setCurrentTable("auth.users");
      setAuthStatus("exporting");
      try {
        const { data, error } = await supabase.functions.invoke("export-database", {
          body: { action: "export-auth-users" },
        });
        if (error) throw error;
        const rows = data.rows || [];
        rowsTotal += rows.length;
        zip.file("_auth_users.json", JSON.stringify(rows, null, 2));
        setAuthStatus("done");
      } catch (err: any) {
        console.error("Error exporting auth users:", err);
        setAuthStatus("error");
      }
      completed++;
      setProgress(Math.round((completed / totalSteps) * 100));

      // Export storage
      setCurrentTable("storage");
      setStorageStatus("exporting");
      try {
        const { data, error } = await supabase.functions.invoke("export-database", {
          body: { action: "export-storage" },
        });
        if (error) throw error;
        rowsTotal += data.count || 0;
        zip.file("_storage_buckets.json", JSON.stringify(data.buckets || [], null, 2));
        zip.file("_storage_objects.json", JSON.stringify(data.objects || {}, null, 2));
        setStorageStatus("done");
      } catch (err: any) {
        console.error("Error exporting storage:", err);
        setStorageStatus("error");
      }
      completed++;
      setProgress(Math.round((completed / totalSteps) * 100));
    }

    // Generate ZIP
    try {
      const blob = await zip.generateAsync({ type: "blob" });
      setZipBlob(blob);
      setTotalRows(rowsTotal);
      toast.success(`Export concluído! ${rowsTotal.toLocaleString()} registros em ${totalSteps} itens.`);
    } catch (err: any) {
      toast.error("Erro ao gerar ZIP: " + err.message);
    }

    setExporting(false);
    setCurrentTable("");
  }, [tables, internal]);

  const downloadZip = useCallback(() => {
    if (!zipBlob) return;
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `database-export-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }, [zipBlob]);

  const statusIcon = (status: "pending" | "exporting" | "done" | "error") => {
    switch (status) {
      case "exporting":
        return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />;
      case "done":
        return <CheckCircle2 className="h-4 w-4 text-green-400" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-400" />;
      default:
        return <div className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Export Database</h1>
          <p className="text-white/50 text-sm mt-1">
            Exportar todas as tabelas do banco em formato JSON (ZIP)
          </p>
        </div>
        <div className="flex gap-2">
          {zipBlob && (
            <Button onClick={downloadZip} className="bg-green-600 hover:bg-green-700">
              <Download className="h-4 w-4 mr-2" />
              Download ZIP ({(zipBlob.size / 1024 / 1024).toFixed(1)} MB)
            </Button>
          )}
        </div>
      </div>

      {/* Actions */}
      <Card className="bg-[#111] border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Database className="h-5 w-5" />
            Exportação Completa
          </CardTitle>
          <CardDescription className="text-white/50">
            Exporta tabelas públicas + auth.users + storage. Máximo de 100k registros por tabela.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Button onClick={loadTables} disabled={loading || exporting} variant="outline" className="border-white/20 text-white hover:bg-white/10">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
              {tables.length > 0 ? "Recarregar Tabelas" : "Listar Tabelas"}
            </Button>

            {tables.length > 0 && (
              <Button onClick={exportAll} disabled={exporting} className="bg-red-600 hover:bg-red-700">
                {exporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Archive className="h-4 w-4 mr-2" />
                )}
                Exportar Tudo ({tables.length} tabelas{internal ? " + auth + storage" : ""})
              </Button>
            )}
          </div>

          {/* Progress */}
          {exporting && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-white/60">
                <span>Exportando: {currentTable}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Summary after export */}
          {zipBlob && !exporting && (
            <div className="flex items-center gap-4 p-3 rounded-lg bg-green-600/10 border border-green-600/20">
              <CheckCircle2 className="h-5 w-5 text-green-400" />
              <div className="text-sm text-white/80">
                <strong>{totalRows.toLocaleString()}</strong> registros exportados de{" "}
                <strong>{tables.length}</strong> tabelas + internal.
                ZIP: <strong>{(zipBlob.size / 1024 / 1024).toFixed(1)} MB</strong>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Internal Tables */}
      {internal && (
        <Card className="bg-[#111] border-white/10">
          <CardHeader>
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-yellow-400" />
              Tabelas Internas
            </CardTitle>
            <CardDescription className="text-white/50">
              Dados de autenticação e storage (não acessíveis via REST público).
              Senhas (hashes) <strong>não</strong> são exportadas — apenas metadados.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Auth Users */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03]">
              <div className="flex items-center gap-3">
                {statusIcon(authStatus)}
                <Users className="h-4 w-4 text-blue-400" />
                <span className="text-sm text-white/80 font-mono">auth.users</span>
              </div>
              <Badge variant="outline" className="text-white/50 border-white/10 font-mono text-xs">
                {internal.authUsersCount >= 0 ? internal.authUsersCount.toLocaleString() : "erro"}
              </Badge>
            </div>

            {/* Storage Buckets */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03]">
              <div className="flex items-center gap-3">
                {statusIcon(storageStatus)}
                <HardDrive className="h-4 w-4 text-purple-400" />
                <span className="text-sm text-white/80 font-mono">storage.objects</span>
              </div>
              <div className="flex gap-2">
                {internal.storageBuckets.map((b) => (
                  <Badge key={b.id} variant="outline" className="text-white/50 border-white/10 font-mono text-xs">
                    {b.name}
                  </Badge>
                ))}
                {internal.storageBuckets.length === 0 && (
                  <Badge variant="outline" className="text-white/50 border-white/10 font-mono text-xs">
                    0 buckets
                  </Badge>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Public Table List */}
      {tables.length > 0 && (
        <Card className="bg-[#111] border-white/10">
          <CardHeader>
            <CardTitle className="text-white text-lg">
              Tabelas Públicas ({tables.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              <div className="space-y-1">
                {tables.map((table) => (
                  <div
                    key={table.name}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {statusIcon(table.status)}
                      <span className="text-sm text-white/80 font-mono">{table.name}</span>
                    </div>
                    <Badge variant="outline" className="text-white/50 border-white/10 font-mono text-xs">
                      {table.count >= 0 ? table.count.toLocaleString() : "erro"}
                    </Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
