-- 2026년 7월 1일부터 8월 31일까지의 daily_logs 데이터 삭제 쿼리
-- ※ 주의: 실행 전 반드시 삭제할 데이터 범위를 확인하세요.

DELETE FROM daily_logs
WHERE log_date >= '2026-07-01' AND log_date <= '2026-08-31';
