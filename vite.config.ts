import { defineConfig } from 'vite';

export default defineConfig({
  root: 'web',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4273',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('proxyReq', (proxyRequest, request) => {
            if (request.headers.origin === 'http://127.0.0.1:5173') {
              proxyRequest.setHeader('Origin', 'http://127.0.0.1:4273');
            }
          });
        },
      },
    },
  },
  build: { outDir: '../dist', emptyOutDir: true },
});
