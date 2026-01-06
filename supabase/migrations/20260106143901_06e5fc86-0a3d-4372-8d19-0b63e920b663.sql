
-- Adicionar política para usuários autenticados verem sua própria company
CREATE POLICY "Users can view their own company"
ON public.companies
FOR SELECT
TO authenticated
USING (
  law_firm_id IN (
    SELECT law_firm_id FROM public.profiles WHERE id = auth.uid()
  )
);
