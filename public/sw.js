self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', function(event) {
  // Supabase 등 외부 API 요청은 Service Worker가 가로채면서 인증 헤더(apikey)가 누락될 수 있으므로 예외 처리
  if (event.request.url.includes('supabase.co')) {
    return;
  }
  
  event.respondWith(fetch(event.request));
});
