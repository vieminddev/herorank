/**
 * Package the browser extension into extension-dist/vierank-extension.zip for Chrome Web Store
 * upload. Uses PowerShell's Compress-Archive (Windows dev env); falls back to `zip` on *nix.
 */
import { mkdirSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const SRC = 'extension';
const OUT_DIR = 'extension-dist';
const OUT = `${OUT_DIR}/vierank-extension.zip`;

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC}/ — nothing to package.`);
  process.exit(1);
}
mkdirSync(OUT_DIR, { recursive: true });
if (existsSync(OUT)) rmSync(OUT);

try {
  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `Compress-Archive -Path '${SRC}/*' -DestinationPath '${OUT}' -Force`],
      { stdio: 'inherit' }
    );
  } else {
    execFileSync('zip', ['-r', `../${OUT}`, '.'], { cwd: SRC, stdio: 'inherit' });
  }
  console.log(`\nPackaged → ${OUT}`);
} catch (e) {
  console.error('Packaging failed:', e.message);
  process.exit(1);
}
