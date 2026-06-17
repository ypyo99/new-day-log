self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', function(event) {
  // Supabase 및 외부 공공 API 요청은 Service Worker가 가로채면 CORS나 인증 문제가 생길 수 있으므로 예외 처리
  if (event.request.url.includes('supabase.co') || event.request.url.includes('apis.data.go.kr')) {
    return;
  }
  
  event.respondWith(fetch(event.request));
});
