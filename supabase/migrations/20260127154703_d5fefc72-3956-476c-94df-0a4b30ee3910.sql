-- =============================================
-- SISTEMA DE TAREFAS INTERNAS
-- =============================================

-- 1. Criar ENUMs para status e prioridade
CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'done');
CREATE TYPE public.task_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- 2. Tabela de categorias de tarefas
CREATE TABLE public.task_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#6B7280',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela principal de tarefas internas
CREATE TABLE public.internal_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    law_firm_id UUID NOT NULL REFERENCES public.law_firms(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    status task_status NOT NULL DEFAULT 'todo',
    priority task_priority NOT NULL DEFAULT 'medium',
    category_id UUID REFERENCES public.task_categories(id) ON DELETE SET NULL,
    due_date TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Tabela de atribuições (múltiplos atendentes por tarefa)
CREATE TABLE public.task_assignees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.internal_tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    UNIQUE(task_id, user_id)
);

-- 5. Tabela de comentários/progresso
CREATE TABLE public.task_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.internal_tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Tabela de histórico de alterações
CREATE TABLE public.task_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.internal_tasks(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    old_values JSONB,
    new_values JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Índices para performance
CREATE INDEX idx_internal_tasks_law_firm ON public.internal_tasks(law_firm_id);
CREATE INDEX idx_internal_tasks_status ON public.internal_tasks(status);
CREATE INDEX idx_internal_tasks_due_date ON public.internal_tasks(due_date);
CREATE INDEX idx_internal_tasks_created_by ON public.internal_tasks(created_by);
CREATE INDEX idx_task_assignees_task ON public.task_assignees(task_id);
CREATE INDEX idx_task_assignees_user ON public.task_assignees(user_id);
CREATE INDEX idx_task_comments_task ON public.task_comments(task_id);
CREATE INDEX idx_task_activity_log_task ON public.task_activity_log(task_id);
CREATE INDEX idx_task_categories_law_firm ON public.task_categories(law_firm_id);

-- 8. Triggers para updated_at
CREATE TRIGGER update_task_categories_updated_at
    BEFORE UPDATE ON public.task_categories
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_internal_tasks_updated_at
    BEFORE UPDATE ON public.internal_tasks
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_task_comments_updated_at
    BEFORE UPDATE ON public.task_comments
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 9. Habilitar RLS em todas as tabelas
ALTER TABLE public.task_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_activity_log ENABLE ROW LEVEL SECURITY;

-- 10. Políticas RLS para task_categories
CREATE POLICY "Users can view own law_firm categories"
ON public.task_categories FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can create categories in own law_firm"
ON public.task_categories FOR INSERT
WITH CHECK (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can update own law_firm categories"
ON public.task_categories FOR UPDATE
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can delete own law_firm categories"
ON public.task_categories FOR DELETE
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

-- 11. Políticas RLS para internal_tasks
CREATE POLICY "Users can view own law_firm tasks"
ON public.internal_tasks FOR SELECT
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can create tasks in own law_firm"
ON public.internal_tasks FOR INSERT
WITH CHECK (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can update own law_firm tasks"
ON public.internal_tasks FOR UPDATE
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

CREATE POLICY "Users can delete own law_firm tasks"
ON public.internal_tasks FOR DELETE
USING (law_firm_id = get_user_law_firm_id(auth.uid()));

-- 12. Políticas RLS para task_assignees (via task -> law_firm)
CREATE POLICY "Users can view assignees of own law_firm tasks"
ON public.task_assignees FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.internal_tasks t
        WHERE t.id = task_id
        AND t.law_firm_id = get_user_law_firm_id(auth.uid())
    )
);

CREATE POLICY "Users can create assignees for own law_firm tasks"
ON public.task_assignees FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.internal_tasks t
        WHERE t.id = task_id
        AND t.law_firm_id = get_user_law_firm_id(auth.uid())
    )
);

CREATE POLICY "Users can delete assignees from own law_firm tasks"
ON public.task_assignees FOR DELETE
USING (
    EXISTS (
        SELECT 1 FROM public.internal_tasks t
        WHERE t.id = task_id
        AND t.law_firm_id = get_user_law_firm_id(auth.uid())
    )
);

-- 13. Políticas RLS para task_comments
CREATE POLICY "Users can view comments on own law_firm tasks"
ON public.task_comments FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.internal_tasks t
        WHERE t.id = task_id
        AND t.law_firm_id = get_user_law_firm_id(auth.uid())
    )
);

CREATE POLICY "Users can create comments on own law_firm tasks"
ON public.task_comments FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.internal_tasks t
        WHERE t.id = task_id
        AND t.law_firm_id = get_user_law_firm_id(auth.uid())
    )
    AND user_id = auth.uid()
);

CREATE POLICY "Users can update own comments"
ON public.task_comments FOR UPDATE
USING (user_id = auth.uid());

CREATE POLICY "Users can delete own comments"
ON public.task_comments FOR DELETE
USING (user_id = auth.uid());

-- 14. Políticas RLS para task_activity_log
CREATE POLICY "Users can view activity of own law_firm tasks"
ON public.task_activity_log FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.internal_tasks t
        WHERE t.id = task_id
        AND t.law_firm_id = get_user_law_firm_id(auth.uid())
    )
);

CREATE POLICY "Users can create activity for own law_firm tasks"
ON public.task_activity_log FOR INSERT
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.internal_tasks t
        WHERE t.id = task_id
        AND t.law_firm_id = get_user_law_firm_id(auth.uid())
    )
);

-- 15. Função para criar categorias padrão para uma empresa
CREATE OR REPLACE FUNCTION public.create_default_task_categories(_law_firm_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.task_categories (law_firm_id, name, color, position)
    VALUES
        (_law_firm_id, 'Administrativo', '#3B82F6', 1),
        (_law_firm_id, 'Suporte', '#22C55E', 2),
        (_law_firm_id, 'Financeiro', '#EAB308', 3),
        (_law_firm_id, 'Comercial', '#8B5CF6', 4),
        (_law_firm_id, 'Outros', '#6B7280', 5)
    ON CONFLICT DO NOTHING;
END;
$$;