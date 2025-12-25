-- Add department_id column to conversations table
ALTER TABLE public.conversations 
ADD COLUMN department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

-- Create index for better performance
CREATE INDEX idx_conversations_department_id ON public.conversations(department_id);