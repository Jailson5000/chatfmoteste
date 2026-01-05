-- =====================================================
-- SECURITY: RPC function for updating admin roles
-- Only super_admin can change roles
-- Includes audit logging
-- =====================================================

CREATE OR REPLACE FUNCTION public.update_admin_role(
  _target_user_id uuid,
  _new_role admin_role
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id uuid;
  _caller_role admin_role;
  _old_role admin_role;
  _target_email text;
  _caller_email text;
BEGIN
  -- Get the calling user's ID
  _caller_id := auth.uid();
  
  IF _caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Get caller's role
  SELECT role INTO _caller_role
  FROM public.admin_user_roles
  WHERE user_id = _caller_id;

  IF _caller_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caller is not an admin');
  END IF;

  -- Only super_admin can change roles
  IF _caller_role != 'super_admin' THEN
    -- Log unauthorized attempt
    INSERT INTO public.audit_logs (
      admin_user_id, 
      action, 
      entity_type, 
      entity_id, 
      new_values
    ) VALUES (
      _caller_id,
      'ROLE_CHANGE_DENIED',
      'admin_security',
      _target_user_id,
      jsonb_build_object(
        'caller_role', _caller_role,
        'attempted_role', _new_role,
        'reason', 'Only super_admin can change roles'
      )
    );

    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin can change roles');
  END IF;

  -- Get target user's current role and email
  SELECT role INTO _old_role
  FROM public.admin_user_roles
  WHERE user_id = _target_user_id;

  SELECT email INTO _target_email
  FROM public.admin_profiles
  WHERE user_id = _target_user_id;

  SELECT email INTO _caller_email
  FROM public.admin_profiles
  WHERE user_id = _caller_id;

  -- Prevent demoting the last super_admin
  IF _old_role = 'super_admin' AND _new_role != 'super_admin' THEN
    IF (SELECT COUNT(*) FROM public.admin_user_roles WHERE role = 'super_admin') <= 1 THEN
      RETURN jsonb_build_object('success', false, 'error', 'Cannot remove the last super_admin');
    END IF;
  END IF;

  -- Update or insert the role
  IF _old_role IS NOT NULL THEN
    UPDATE public.admin_user_roles
    SET role = _new_role
    WHERE user_id = _target_user_id;
  ELSE
    INSERT INTO public.admin_user_roles (user_id, role)
    VALUES (_target_user_id, _new_role);
  END IF;

  -- Log successful role change
  INSERT INTO public.audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  ) VALUES (
    _caller_id,
    'ADMIN_ROLE_CHANGED',
    'admin_user',
    _target_user_id,
    jsonb_build_object('role', _old_role, 'email', _target_email),
    jsonb_build_object('role', _new_role, 'changed_by', _caller_email)
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_role', _old_role,
    'new_role', _new_role,
    'target_email', _target_email
  );
END;
$$;

-- Grant execute to authenticated users (RPC will validate internally)
GRANT EXECUTE ON FUNCTION public.update_admin_role(uuid, admin_role) TO authenticated;

-- =====================================================
-- SECURITY: RPC function for toggling admin active status
-- Only super_admin can toggle status
-- Includes audit logging
-- =====================================================

CREATE OR REPLACE FUNCTION public.toggle_admin_active(
  _target_user_id uuid,
  _is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id uuid;
  _caller_role admin_role;
  _old_status boolean;
  _target_email text;
  _caller_email text;
BEGIN
  -- Get the calling user's ID
  _caller_id := auth.uid();
  
  IF _caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Prevent self-deactivation
  IF _caller_id = _target_user_id AND _is_active = false THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cannot deactivate yourself');
  END IF;

  -- Get caller's role
  SELECT role INTO _caller_role
  FROM public.admin_user_roles
  WHERE user_id = _caller_id;

  IF _caller_role IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Caller is not an admin');
  END IF;

  -- Only super_admin can toggle active status
  IF _caller_role != 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only super_admin can change admin status');
  END IF;

  -- Get target info
  SELECT is_active, email INTO _old_status, _target_email
  FROM public.admin_profiles
  WHERE user_id = _target_user_id;

  SELECT email INTO _caller_email
  FROM public.admin_profiles
  WHERE user_id = _caller_id;

  IF _target_email IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Target admin not found');
  END IF;

  -- Update status
  UPDATE public.admin_profiles
  SET is_active = _is_active
  WHERE user_id = _target_user_id;

  -- Log the change
  INSERT INTO public.audit_logs (
    admin_user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values
  ) VALUES (
    _caller_id,
    CASE WHEN _is_active THEN 'ADMIN_ACTIVATED' ELSE 'ADMIN_DEACTIVATED' END,
    'admin_user',
    _target_user_id,
    jsonb_build_object('is_active', _old_status, 'email', _target_email),
    jsonb_build_object('is_active', _is_active, 'changed_by', _caller_email)
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_status', _old_status,
    'new_status', _is_active,
    'target_email', _target_email
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.toggle_admin_active(uuid, boolean) TO authenticated;