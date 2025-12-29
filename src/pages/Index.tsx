import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { LandingPage } from "@/pages/landing/LandingPage";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Basic page title hygiene when navigating back from other pages
    const previousTitle = document.title;
    document.title = "MiauChat - Atendimento com IA";

    return () => {
      document.title = previousTitle || "MiauChat";
    };
  }, []);

  useEffect(() => {
    if (user) {
      navigate("/dashboard");
    }
  }, [user, navigate]);

  if (loading) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return <LandingPage />;
};

export default Index;
