self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', function(event) {
  // 간단한 Fetch 이벤트 리스너 (PWA 설치 조건을 만족하기 위한 최소 요건)
  // 여기서는 네트워크 요청을 그대로 통과시킵니다.
  event.respondWith(fetch(event.request));
});
