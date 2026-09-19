import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

async function build() {
  const distDir = path.join(rootDir, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  console.log('[Build] Bundling content scripts and styles...');

  // Concatenate CSS files
  const cssFiles = [
    path.join(rootDir, 'src', 'styles', 'overlay.css'),
    path.join(rootDir, 'src', 'styles', 'hover-button.css')
  ];

  let combinedCss = '/* Immerse - Combined Content Styles */\n';
  for (const file of cssFiles) {
    if (fs.existsSync(file)) {
      combinedCss += `\n/* --- ${path.basename(file)} --- */\n` + fs.readFileSync(file, 'utf8') + '\n';
    }
  }

  fs.writeFileSync(path.join(distDir, 'content.css'), combinedCss);
  console.log('[Build] Generated dist/content.css');

  // Bundle JS using esbuild
  try {
    const esbuild = await import('esbuild');
    await esbuild.build({
      entryPoints: [path.join(rootDir, 'src', 'content.js')],
      bundle: true,
      outfile: path.join(distDir, 'content.js'),
      format: 'iife',
      target: ['chrome100'],
      minify: false,
      sourcemap: false
    });
    console.log('[Build] Generated dist/content.js using esbuild');
  } catch (err) {
    console.warn('[Build] esbuild not available or failed:', err.message);
  }

  console.log('[Build] Build complete!');
}

build().catch(err => {
  console.error('[Build] Failed:', err);
  process.exit(1);
});
