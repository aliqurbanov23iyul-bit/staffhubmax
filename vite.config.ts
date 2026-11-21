import fs from 'fs';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    root: path.resolve(__dirname, 'public'),
    publicDir: false as const,
    plugins: [
      {
        name: 'copy-public-static-assets',
        apply: 'build' as const,
        closeBundle(error?: Error): void {
          if (error) return;
          const distDir = path.resolve(__dirname, 'dist');
          const publicAssets = path.resolve(__dirname, 'public/assets');
          const distAssets = path.resolve(distDir, 'assets');
          if (fs.existsSync(distDir) && fs.existsSync(publicAssets)) {
            fs.cpSync(publicAssets, distAssets, { recursive: true, force: true });
          }
          // Also copy any unbundled js modules/pages if referenced dynamically
          const publicJs = path.resolve(__dirname, 'public/js');
          const distJs = path.resolve(distDir, 'js');
          if (fs.existsSync(distDir) && fs.existsSync(publicJs)) {
            fs.cpSync(publicJs, distJs, { recursive: true, force: true });
          }
        },
      },
    ],
    build: {
      outDir: path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
    },
    server: {
      hmr: false,
      watch: null,
    },
  };
});
