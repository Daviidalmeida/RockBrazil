import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  base: '/RockBrazil/',
  plugins: [
    {
      name: 'exclude-commercial-custom-songs',
      closeBundle() {
        const customSongsDir = path.resolve(__dirname, 'dist/custom-songs');
        if (fs.existsSync(customSongsDir)) {
          fs.rmSync(customSongsDir, { recursive: true, force: true });
          console.log('🔒 Removido dist/custom-songs: arquivos de áudio protegidos excluídos da build.');
        }
        // Suporte a recarregamento no GitHub Pages
        const indexPath = path.resolve(__dirname, 'dist/index.html');
        const fallbackPath = path.resolve(__dirname, 'dist/404.html');
        if (fs.existsSync(indexPath)) {
          fs.copyFileSync(indexPath, fallbackPath);
          console.log('📄 Criado dist/404.html para suporte a recarregamento no GitHub Pages.');
        }
      }
    }
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    cors: true
  },
  preview: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true
  }
});
