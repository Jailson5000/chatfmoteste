import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Scale, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-background to-muted/50 px-4">
      <div className="text-center max-w-2xl">
        <div className="flex justify-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-primary">
            <Scale className="h-8 w-8 text-primary-foreground" />
          </div>
        </div>
        
        <h1 className="mb-4 text-4xl font-bold tracking-tight text-foreground">
          Sistema Jurídico Inteligente
        </h1>
        
        <p className="mb-8 text-lg text-muted-foreground">
          Gerencie seus clientes, processos e automações com inteligência artificial.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button asChild size="lg">
            <Link to="/auth">
              Entrar <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/auth?tab=signup">
              Criar Conta
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Index;
