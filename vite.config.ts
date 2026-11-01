import { defineConfig } from 'vite';

export default defineConfig({
  // MapLibre 6 worker는 ES 모듈이라 worker도 ES 형식으로 번들
  worker: { format: 'es' },
  build: { chunkSizeWarningLimit: 1500 },
});
