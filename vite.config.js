import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000'
    }
  },
  build: {
    outDir: 'dist',
    // 生产包不再附带 sourcemap：此前 dist 里 6.7MB 的 .map 既拖体积，也把源码一并发布出去。
    // 需要排查线上问题时改成 'hidden' 并单独保管 map 文件。
    sourcemap: false,
    rolldownOptions: {
      output: {
        // 把长期不变的第三方库单独切出来：改一行业务代码不再让用户
        // 重新下载整个 700KB 的包，回访和评委反复刷新时差别很明显。
        // rolldown 只接受函数形式的 manualChunks
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('framer-motion') || id.includes('motion-dom') || id.includes('motion-utils')) return 'vendor-motion';
          if (id.includes('lucide-react')) return 'vendor-icons';
          // recharts 刻意不在这里命名分组：一旦分进具名 chunk，
          // rolldown 会给入口加上 modulepreload，等于把懒加载又拉回首屏。
          // 让它跟着 EvaluationView 的 dynamic import 自然成块。
          return undefined;
        }
      }
    }
  }
});
