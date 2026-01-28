import * as React from "react";

type Props = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  onError?: (error: unknown, info: React.ErrorInfo) => void;
};

type State = {
  hasError: boolean;
};

/**
 * ErrorBoundary local para evitar que uma exceção dentro do modal derrube o app inteiro (tela preta).
 * Mantém o escopo restrito ao InviteMemberDialog.
 */
export class InviteMemberDialogErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error("[InviteMemberDialog] Uncaught render error", error, info);
    this.props.onError?.(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
            Ocorreu um erro ao exibir os departamentos. Recarregue a página e tente novamente.
          </div>
        )
      );
    }

    return this.props.children;
  }
}
