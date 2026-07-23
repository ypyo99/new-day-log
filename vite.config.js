import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const BUILD_TIMESTAMP = new Date().getTime().toString();

// 자동 새로고침을 위한 버전 관리 플러그인
// 앱이 최신 버전인지 확인하기 위해 배포/실행될 때마다 새로운 시간값을 가진 version.json을 제공합니다.
const versionUpdatePlugin = () => {
  return {
    name: 'version-update',
    // 1. 실제 배포용으로 빌드(npm run build)할 때 dist 폴더 안에 version.json을 생성합니다.
    generateBundle() {
      const versionInfo = JSON.stringify({
        version: BUILD_TIMESTAMP
      });
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: versionInfo
      });
    },
    // 2. 개발 모드(npm run dev)일 때는 가상으로 /version.json 요청에 응답합니다.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/version.json') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.end(JSON.stringify({ version: BUILD_TIMESTAMP }));
        } else {
          next();
        }
      });
    }
  };
};

export default defineConfig({
  plugins: [react(), versionUpdatePlugin()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(BUILD_TIMESTAMP)
  },
  server: {
    port: 3000,
    open: true
  }
});
