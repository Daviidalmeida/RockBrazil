import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('GitHub Pages & Production Build Verification', () => {
  it('workflow .github/workflows/deploy.yml exists and has proper permissions and branches', () => {
    const workflowPath = path.resolve(__dirname, '../.github/workflows/deploy.yml');
    expect(fs.existsSync(workflowPath)).toBe(true);

    const content = fs.readFileSync(workflowPath, 'utf-8');
    expect(content).toContain('branches:\n      - main');
    expect(content).toContain('pages: write');
    expect(content).toContain('id-token: write');
    expect(content).toContain('npm ci');
    expect(content).toContain('npm test');
    expect(content).toContain('npm run build');
    expect(content).toContain("path: './dist'");
  });

  it('vite.config.ts is configured with base: "/RockBrazil/"', () => {
    const viteConfigPath = path.resolve(__dirname, '../vite.config.ts');
    const content = fs.readFileSync(viteConfigPath, 'utf-8');
    expect(content).toContain("base: '/RockBrazil/'");
  });

  it('production dist directory does not include protected audio or commercial stems', () => {
    const distPath = path.resolve(__dirname, '../dist');
    if (fs.existsSync(distPath)) {
      const customSongsInDist = path.join(distPath, 'custom-songs');
      expect(fs.existsSync(customSongsInDist)).toBe(false);

      // Verify essential build artifacts exist
      expect(fs.existsSync(path.join(distPath, 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(distPath, '404.html'))).toBe(true);
      expect(fs.existsSync(path.join(distPath, 'images/stage-bg.png'))).toBe(true);
      expect(fs.existsSync(path.join(distPath, 'images/menu-bg.jpg'))).toBe(true);
      expect(fs.existsSync(path.join(distPath, 'images/login-bg.jpg'))).toBe(true);
    }
  });

  it('package-lock.json contains @rollup/rollup-linux-x64-gnu with valid integrity for Linux CI', () => {
    const lockPath = path.resolve(__dirname, '../package-lock.json');
    expect(fs.existsSync(lockPath)).toBe(true);
    const lockContent = fs.readFileSync(lockPath, 'utf-8');
    const lock = JSON.parse(lockContent);
    const linuxEntry = lock.packages?.['node_modules/@rollup/rollup-linux-x64-gnu'];
    expect(linuxEntry).toBeDefined();
    expect(linuxEntry.resolved).toContain('rollup-linux-x64-gnu');
    expect(linuxEntry.integrity).toBeTruthy();
  });
});
