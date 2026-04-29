CREATE OR REPLACE FUNCTION get_client_weight_logs(client_id UUID)
RETURNS TABLE (
  id UUID,
  log_date DATE,
  weight NUMERIC,
  unit TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the caller is the coach of the client
  IF NOT EXISTS (
    SELECT 1 FROM coach_clients cc
    WHERE cc.coach_id = auth.uid()
    AND cc.client_id = get_client_weight_logs.client_id
  ) THEN
    RETURN; -- Return empty if not authorized
  END IF;

  RETURN QUERY
  SELECT uwl.id, uwl.log_date, uwl.weight, uwl.unit, uwl.created_at
  FROM user_weight_logs uwl
  WHERE uwl.user_id = get_client_weight_logs.client_id
  ORDER BY uwl.log_date DESC;
END;
$$;
