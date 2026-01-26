-- Trigger function to create admin notification when a new support ticket is created
CREATE OR REPLACE FUNCTION public.notify_admin_new_ticket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _company_name text;
BEGIN
  -- Get company name
  SELECT name INTO _company_name FROM public.law_firms WHERE id = NEW.law_firm_id;
  
  -- Insert notification for all admins (admin_user_id = null means broadcast to all)
  INSERT INTO public.notifications (
    user_id,
    admin_user_id,
    title,
    message,
    type,
    is_read,
    metadata
  ) VALUES (
    null,
    null,
    'Novo Ticket de Suporte',
    'Empresa ' || COALESCE(_company_name, 'Desconhecida') || ' abriu um ticket: ' || NEW.title,
    'NEW_TICKET',
    false,
    jsonb_build_object(
      'ticket_id', NEW.id,
      'ticket_title', NEW.title,
      'ticket_type', NEW.type,
      'law_firm_id', NEW.law_firm_id,
      'company_name', _company_name
    )
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger on support_tickets
DROP TRIGGER IF EXISTS trigger_notify_admin_new_ticket ON public.support_tickets;
CREATE TRIGGER trigger_notify_admin_new_ticket
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_new_ticket();

-- Trigger function to create admin notification when a new company is provisioned
CREATE OR REPLACE FUNCTION public.notify_admin_new_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only notify when status changes to 'active' or 'partial' (company just provisioned)
  IF NEW.status IN ('active', 'partial') AND (OLD.status IS NULL OR OLD.status = 'pending') THEN
    INSERT INTO public.notifications (
      user_id,
      admin_user_id,
      title,
      message,
      type,
      is_read,
      metadata
    ) VALUES (
      null,
      null,
      'Nova Empresa Cadastrada',
      'Empresa "' || NEW.name || '" foi provisionada com sucesso',
      'NEW_COMPANY',
      false,
      jsonb_build_object(
        'company_id', NEW.id,
        'company_name', NEW.name,
        'subdomain', NEW.subdomain,
        'status', NEW.status
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on companies
DROP TRIGGER IF EXISTS trigger_notify_admin_new_company ON public.companies;
CREATE TRIGGER trigger_notify_admin_new_company
  AFTER UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_new_company();