/**
 * Patch Svelte 5's ESM compiler entry to export VERSION on Node 24.
 * 
 * Problem: Svelte 5.56.3's `./src/compiler/index.js` (the ESM "default" export for "./compiler")
 * doesn't export VERSION. On Node 22 this worked because the CJS path was used, but Node 24's
 * ESM resolver picks the "default" (source) entry and VERSION is missing.
 * 
 * Fix: Append `export const VERSION = '5.56.3';` to the ESM entry if not already there.
 */
const fs = require('fs');
const path = require('path');

// Get actual version from package.json
const pkgPath = path.resolve('./node_modules/svelte/package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

// Patch the ESM compiler entry
const compilerEntry = path.resolve('./node_modules/svelte/src/compiler/index.js');
let content = fs.readFileSync(compilerEntry, 'utf8');

if (!content.includes('export const VERSION')) {
  content += `\n\n// Patched for Node 24 ESM compatibility\nexport const VERSION = '${version}';\n`;
  fs.writeFileSync(compilerEntry, content);
  console.log(`✅ Patched svelte/src/compiler/index.js — added VERSION = '${version}'`);
} else {
  console.log('Already patched');
}
