import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { english, selectLanguage, translate } from '../web/localization';

test('saved language takes precedence over browser language', () => {
  assert.equal(selectLanguage('en', 'fr-FR'), 'en');
  assert.equal(selectLanguage('fr', 'en-US'), 'fr');
  assert.equal(selectLanguage(null, 'fr-CA'), 'fr');
  assert.equal(selectLanguage('invalid', 'en-GB'), 'en');
});

test('translations preserve mod names and interpolate values without HTML', () => {
  const values = { mod: 'My_Mod', target: 'Core<123>' };
  assert.equal(
    translate('en', '{{mod}} doit être chargé après {{target}}.', values),
    'My_Mod must load after Core<123>.',
  );
  assert.equal(
    translate('fr', '{{mod}} doit être chargé après {{target}}.', values),
    'My_Mod doit être chargé après Core<123>.',
  );
});

test('all literal UI translation keys have English translations with matching placeholders', async () => {
  const root = path.resolve('web');
  const keys = new Set<string>();
  for (const entry of await fs.readdir(root)) {
    if (!/\.tsx?$/.test(entry)) continue;
    const text = await fs.readFile(path.join(root, entry), 'utf8');
    const source = ts.createSourceFile(
      entry,
      text,
      ts.ScriptTarget.Latest,
      true,
      entry.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ['t', 'translateCurrent'].includes(node.expression.text)
      ) {
        const argument = node.arguments[0];
        if (argument && ts.isStringLiteralLike(argument)) keys.add(argument.text);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  for (const key of keys) {
    assert.ok(english[key]?.trim(), `Missing English translation: ${key}`);
    const placeholders = (value: string) =>
      [...value.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(placeholders(english[key]), placeholders(key), `Placeholder mismatch: ${key}`);
  }
  assert.ok(keys.size >= 150, 'Expected coverage of the full interface');
});
