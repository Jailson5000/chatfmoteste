import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import { APP_BUILD_ID } from "@/lib/buildInfo";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
      "| build:",
      APP_BUILD_ID
    );
  }, [location.pathname]);

  const isGlobalAdminPath = location.pathname.startsWith("/global-admin");

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted">
      <section className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <a href="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </a>

        <div className="mt-6 space-y-2">
          {isGlobalAdminPath && (
            <p className="text-sm text-muted-foreground">
              Se você esperava ver o painel global aqui, o VPS provavelmente está servindo um build antigo.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Rota: <span className="font-mono">{location.pathname}</span> • Build: <span className="font-mono">{APP_BUILD_ID}</span>
          </p>
        </div>
      </section>
    </main>
  );
};

export default NotFound;

