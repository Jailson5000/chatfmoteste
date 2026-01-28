-- Habilitar Realtime para tabelas de configuração
-- Isso permitirá que o RealtimeSyncContext receba eventos de mudança
-- e atualize a UI automaticamente quando status, tags ou departamentos forem criados/editados

ALTER PUBLICATION supabase_realtime ADD TABLE custom_statuses;
ALTER PUBLICATION supabase_realtime ADD TABLE tags;
ALTER PUBLICATION supabase_realtime ADD TABLE departments;
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_instances;
ALTER PUBLICATION supabase_realtime ADD TABLE scheduled_follow_ups;