-- 29/10/2026: Sheet học vụ (MTM_9_TAB.gs) báo HTTP 502 mọi lượt. Đo trên DB thật: tongquan 5,4 s, cachitiet 5,2 s, xephang 5,1 s,
-- diem 2,3 s khi chạy riêng; Apps Script gọi song song 9 tab nên vượt giới hạn 8 s của vai authenticator (service_role không đặt riêng)
-- -> PostgREST hủy câu (57014) -> Edge trả 502. service_role chỉ dùng phía máy chủ (Edge, Vercel), nâng lên 60 s. Chạy lại vô hại.
alter role service_role set statement_timeout = '60s';
notify pgrst, 'reload config';
