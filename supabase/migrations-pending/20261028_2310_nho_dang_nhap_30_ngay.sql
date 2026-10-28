-- 28/10/2026 23:10: "Nhớ đăng nhập" cho học sinh. Phiên tạo lúc đăng nhập vẫn 4 giờ (mã HS: 8 giờ);
-- khi HS đánh dấu ô Nhớ đăng nhập, máy chủ gọi hàm này ngay sau đăng nhập để kéo phiên đó lên 30 ngày.
-- Chỉ kéo phiên còn hiệu lực, chưa thu hồi; Thoát vẫn thu hồi ngay. Không sửa hàm đăng nhập. Chạy lại vô hại.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
CREATE OR REPLACE FUNCTION public.mtm_btvn_remember(p_session text) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE n integer := 0; m integer := 0;
BEGIN
  IF p_session IS NULL OR p_session !~ '^[0-9a-f]{64}$' THEN RETURN false; END IF;
  UPDATE mtm_hw_private.btvn_identity_sessions SET expires_at = clock_timestamp() + interval '30 days'
   WHERE digest = mtm_hw_private.token_digest('btvn-identity', p_session) AND revoked_at IS NULL AND expires_at > clock_timestamp();
  GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE mtm_hw_private.sessions SET expires_at = clock_timestamp() + interval '30 days'
   WHERE digest = mtm_hw_private.token_digest('session', p_session) AND revoked_at IS NULL AND expires_at > clock_timestamp();
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m > 0;
END$$;
REVOKE ALL ON FUNCTION public.mtm_btvn_remember(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mtm_btvn_remember(text) TO service_role;
COMMIT;
