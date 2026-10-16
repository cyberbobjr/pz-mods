import { execFileSync } from 'node:child_process';

const files = execFileSync('git', ['ls-files', '--cached', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);
if (!files.length) throw new Error('Aucun fichier dans l’index Git à vérifier.');
const rules = [
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['Personal home path', /[A-Za-z]:[\\/]Users[\\/][^\s\\/"'<>]+/i],
  ['Credential in URL', /https?:\/\/[^\s/@]+:[^\s/@]+@/i],
  [
    'Credential assignment',
    /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*["']?\s*[:=]\s*["'][A-Za-z0-9_\-+/=]{16,}["']/i,
  ],
];
const failures = [];
for (const file of files) {
  if (
    /(?:^|\/)(?:node_modules|dist|\.cache|\.playwright-mcp|Saves|backups)(?:\/|$)/i.test(file) ||
    (/(?:^|\/)\.env(?:$|\.)/.test(file) && !file.endsWith('.env.example')) ||
    /\.(?:bak|tmp|log|pem|key|pfx|p12)$/i.test(file) ||
    /(?:^|\/)\.npmrc$/.test(file) ||
    /(?:^|\/)pz_modlist_settings\.cfg$/i.test(file)
  ) {
    failures.push(`${file}: fichier local ou confidentiel interdit`);
    continue;
  }
  const bytes = execFileSync('git', ['show', ':' + file], { maxBuffer: 20 * 1024 * 1024 });
  if (/\.(?:png|jpg|jpeg|webp|gif)$/i.test(file)) continue;
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [label, expression] of rules)
      if (expression.test(line)) failures.push(`${file}:${index + 1}: ${label}`);
  });
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `${files.length} fichiers de l’index vérifiés : aucun secret connu, chemin personnel ou artefact local détecté.`,
  );
