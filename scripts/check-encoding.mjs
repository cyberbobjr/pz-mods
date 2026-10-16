import fs from 'node:fs/promises';
import path from 'node:path';

const excluded = new Set(['node_modules', 'dist', '.cache', '.git', '.playwright-mcp']);
const textExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.json',
  '.md',
  '.html',
  '.css',
  '.bat',
]);
const decoder = new TextDecoder('utf-8', { fatal: true });

async function checkDirectory(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!excluded.has(entry.name)) await checkDirectory(file);
    } else if (textExtensions.has(path.extname(file)) || entry.name === '.editorconfig') {
      const text = decoder.decode(await fs.readFile(file));
      if (text.includes('\uFFFD')) throw new Error(`Caractère de remplacement détecté : ${file}`);
    }
  }
}

await checkDirectory(process.cwd());
console.log('UTF-8 valide : aucun caractère de remplacement dans les sources.');
