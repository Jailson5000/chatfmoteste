import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useGoogleCalendar } from "@/hooks/useGoogleCalendar";

export default function Agenda() {
  const navigate = useNavigate();
  const { isConnected, integration, isLoading } = useGoogleCalendar();

  // Redirect if Google Calendar is not connected
  useEffect(() => {
    if (!isLoading && (!isConnected || !integration?.is_active)) {
      navigate("/dashboard");
    }
  }, [isConnected, integration, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isConnected || !integration?.is_active) {
    return null;
  }

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Agenda</h1>
      <p className="text-muted-foreground">Conteúdo da agenda será adicionado em breve.</p>
    </div>
  );
}
