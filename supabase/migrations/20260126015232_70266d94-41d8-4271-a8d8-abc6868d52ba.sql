-- Create tutorials table for admin management
CREATE TABLE public.tutorials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  youtube_id TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Geral',
  thumbnail_url TEXT,
  duration TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  position INTEGER NOT NULL DEFAULT 0,
  context TEXT,
  prerequisites TEXT[],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tutorials ENABLE ROW LEVEL SECURITY;

-- Public read access for active tutorials (clients can view)
CREATE POLICY "Anyone can view active tutorials"
  ON public.tutorials
  FOR SELECT
  USING (is_active = true);

-- Only global admins can manage tutorials
CREATE POLICY "Global admins can manage tutorials"
  ON public.tutorials
  FOR ALL
  USING (public.is_admin(auth.uid()));

-- Add trigger for updated_at
CREATE TRIGGER update_tutorials_updated_at
  BEFORE UPDATE ON public.tutorials
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert some sample tutorials
INSERT INTO public.tutorials (title, description, youtube_id, category, duration, is_featured, position, context, prerequisites) VALUES
  ('Bem-vindo ao MiauChat', 'Aprenda os conceitos básicos da plataforma e como começar a usar.', 'dQw4w9WgXcQ', 'Introdução', '5:30', true, 1, 'Este vídeo orienta novos usuários a criarem uma conta e configurarem a plataforma de forma eficaz.', ARRAY['Conhecimento básico de informática', 'Acesso à internet']),
  ('Configurando seu primeiro Agente de IA', 'Passo a passo para criar e configurar um agente de atendimento automático.', 'dQw4w9WgXcQ', 'Agentes', '8:45', true, 2, 'O vídeo ensina a usar agentes IA no MiauChat, essencial para quem quer automatizar processos.', ARRAY['Ter uma conta ativa', 'Entender o básico da plataforma']),
  ('Gerenciando Conversas', 'Como organizar, filtrar e responder conversas de forma eficiente.', 'dQw4w9WgXcQ', 'Conversas', '6:20', false, 3, 'Esse vídeo apresenta um overview sobre o sistema de atendimento.', ARRAY['Ter conversas ativas']),
  ('Conectando o WhatsApp', 'Tutorial completo para conectar sua instância do WhatsApp.', 'dQw4w9WgXcQ', 'Conexões', '4:15', true, 4, 'O vídeo mostra como conectar o WhatsApp, facilitando a gestão de mensagens.', ARRAY['Ter um número de WhatsApp disponível']);