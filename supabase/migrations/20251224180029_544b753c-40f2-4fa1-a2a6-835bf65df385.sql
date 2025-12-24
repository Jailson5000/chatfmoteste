-- Create storage bucket for chat media files
INSERT INTO storage.buckets (id, name, public) 
VALUES ('chat-media', 'chat-media', true);

-- Create RLS policies for chat media bucket
CREATE POLICY "Users can upload chat media" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'chat-media' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view chat media" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'chat-media');

CREATE POLICY "Users can delete their uploads" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'chat-media' AND auth.uid() IS NOT NULL);