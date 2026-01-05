import { useState, useRef, useCallback, useEffect } from "react";
import { ArrowLeft, Upload, FileText, CheckCircle2, Download, Info, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWhatsAppInstances } from "@/hooks/useWhatsAppInstances";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/inputMasks";

type ImportStep = "upload" | "mapping" | "complete";

interface ImportContactsDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (file: File, connectionId?: string) => Promise<void>;
}

export function ImportContactsDialog({
  open,
  onClose,
  onImport,
}: ImportContactsDialogProps) {
  const [step, setStep] = useState<ImportStep>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { instances, isLoading: isLoadingInstances } = useWhatsAppInstances();

  // Filter connected instances for import
  const connectedInstances = instances.filter(i => i.status === "connected");
  
  // Auto-select first connected instance when available
  useEffect(() => {
    if (connectedInstances.length > 0 && !selectedConnection) {
      setSelectedConnection(connectedInstances[0].id);
    }
  }, [connectedInstances, selectedConnection]);

  const handleClose = () => {
    setStep("upload");
    setSelectedFile(null);
    setSelectedConnection("");
    setIsDragging(false);
    setIsImporting(false);
    onClose();
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
        setSelectedFile(file);
      }
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleStartImport = async () => {
    if (!selectedFile) return;
    
    setIsImporting(true);
    try {
      await onImport(selectedFile, selectedConnection || undefined);
      setStep("complete");
    } catch (error) {
      // Error is handled by parent
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = "nome,telefone,email\nJoão Silva,11999998888,joao@email.com\nMaria Santos,11888887777,maria@email.com";
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "template-contatos.csv";
    link.click();
  };

  const steps = [
    { key: "upload", label: "Upload", icon: Upload },
    { key: "mapping", label: "Mapeamento", icon: FileText },
    { key: "complete", label: "Concluído", icon: CheckCircle2 },
  ] as const;

  const currentStepIndex = steps.findIndex(s => s.key === step);


  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
      <DialogContent className="max-w-3xl p-0 gap-0 overflow-hidden">
        {/* Header with back button */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClose}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex justify-center py-4 border-b border-border bg-muted/20">
          <div className="inline-flex rounded-full bg-muted/50 p-1">
            <button className="px-6 py-2 rounded-full bg-primary text-primary-foreground text-sm font-medium">
              Nova Importação
            </button>
            <button className="px-6 py-2 rounded-full text-muted-foreground text-sm font-medium hover:text-foreground transition-colors">
              Histórico
            </button>
          </div>
        </div>

        {/* Stepper */}
        <div className="flex justify-center py-6">
          <div className="flex items-center gap-0">
            {steps.map((s, idx) => {
              const Icon = s.icon;
              const isActive = idx === currentStepIndex;
              const isCompleted = idx < currentStepIndex;

              return (
                <div key={s.key} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                        isActive || isCompleted
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <span
                      className={cn(
                        "text-xs mt-2 font-medium",
                        isActive || isCompleted
                          ? "text-foreground"
                          : "text-muted-foreground"
                      )}
                    >
                      {s.label}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={cn(
                        "w-16 h-0.5 mx-2 mt-[-20px]",
                        idx < currentStepIndex ? "bg-primary" : "bg-muted"
                      )}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="px-8 pb-8">
          {step === "upload" && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold">Importar Contatos</h2>
                <p className="text-muted-foreground mt-2">
                  Faça upload do seu arquivo CSV para importar contatos em massa
                </p>
              </div>

              {/* Drop Zone */}
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50",
                  selectedFile && "border-primary bg-primary/5"
                )}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".csv,.txt"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                </div>
                
                {selectedFile ? (
                  <div>
                    <p className="font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Clique para selecionar outro arquivo
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-foreground">
                      Arraste seu arquivo CSV aqui
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      ou clique para selecionar do seu computador
                    </p>
                  </div>
                )}

                <Button
                  variant="outline"
                  className="mt-4 gap-2"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  <FileText className="h-4 w-4" />
                  Selecionar Arquivo
                </Button>
              </div>

              {/* Limit info */}
              <div className="flex items-center gap-2 justify-center text-sm text-muted-foreground">
                <Info className="h-4 w-4" />
                <span>Limite máximo de 2.000 contatos por importação</span>
              </div>

              {/* Connection Selector */}
              <div className="border rounded-lg p-4 space-y-3">
                <label className="text-sm font-medium">Conexão WhatsApp</label>
                <Select
                  value={selectedConnection}
                  onValueChange={setSelectedConnection}
                  disabled={connectedInstances.length === 0}
                >
                  <SelectTrigger className="w-full bg-muted/30">
                    {isLoadingInstances ? (
                      <span className="text-muted-foreground">Carregando conexões...</span>
                    ) : connectedInstances.length === 0 ? (
                      <span className="text-muted-foreground">Nenhuma conexão disponível</span>
                    ) : (
                      <SelectValue placeholder="Selecione uma conexão" />
                    )}
                  </SelectTrigger>
                  <SelectContent position="popper" className="z-[9999]">
                    {connectedInstances.map((instance) => (
                      <SelectItem key={instance.id} value={instance.id}>
                        <div className="flex items-center gap-3">
                          <Smartphone className="h-4 w-4 text-emerald-500 shrink-0" />
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {instance.display_name || instance.instance_name}
                            </span>
                            {instance.phone_number && (
                              <span className="text-xs text-muted-foreground">
                                {formatPhone(instance.phone_number)}
                              </span>
                            )}
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {connectedInstances.length === 0 && !isLoadingInstances && (
                  <p className="text-xs text-muted-foreground">
                    Conecte uma instância WhatsApp em Conexões para vincular contatos.
                  </p>
                )}
              </div>

              {/* Template Download */}
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  onClick={handleDownloadTemplate}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Baixar Template de Exemplo
                </Button>
              </div>

              {/* Start Import Button */}
              {selectedFile && (
                <Button
                  onClick={handleStartImport}
                  disabled={isImporting}
                  className="w-full"
                >
                  {isImporting ? "Importando..." : "Iniciar Importação"}
                </Button>
              )}
            </div>
          )}

          {step === "complete" && (
            <div className="text-center space-y-6 py-8">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-emerald-500">Importação Concluída!</h2>
                <p className="text-muted-foreground mt-2">
                  Seus contatos foram importados com sucesso.
                </p>
              </div>
              <Button onClick={handleClose} className="min-w-[200px]">
                Fechar
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
