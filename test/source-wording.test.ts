import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceLabel } from '../web/source-labels';
import labels from '../web/source-wording.json';
import { translate } from '../web/localization';

test('source wording is explicit and leaves real-save and global instructions unchanged', () => {
  assert.equal(sourceLabel('Dans la sauvegarde', 'save'), 'Dans la sauvegarde');
  assert.equal(sourceLabel('Dans la sauvegarde', 'collection'), 'Dans la collection');
  const global = 'L’analyse ne modifie aucune sauvegarde, aucun serveur et aucun abonnement.';
  assert.equal(sourceLabel(global, 'collection'), global);
  assert.match(
    sourceLabel(
      'Une copie de mods.txt sera créée avant l’ajout. Conservez également une copie complète de votre sauvegarde.',
      'collection',
    ),
    /autres collections et les favoris/,
  );
});

test('all source-specific detail labels and dependency badges respect collection context', () => {
  const keys = [
    'DANS LA SAUVEGARDE',
    'HORS SAUVEGARDE',
    'sous-mod(s) activé(s) dans cette sauvegarde',
    'Retire uniquement cet identifiant de la sauvegarde, après confirmation. Les fichiers restent installés.',
    'Activer uniquement ce sous-mod dans la sauvegarde courante, après prévisualisation.',
    'Activer dans la sauvegarde',
    'Déclaré comme prérequis par {{count}} mod(s), dont {{active}} actif(s) dans cette sauvegarde.',
  ];
  for (const key of keys) {
    assert.equal(sourceLabel(key, 'save'), key);
    assert.doesNotMatch(sourceLabel(key, 'collection'), /sauvegarde/i);
    assert.match(sourceLabel(key, 'collection'), /collection/i);
  }
  assert.equal(
    translate('en', sourceLabel('DANS LA SAUVEGARDE', 'collection')),
    'IN THE COLLECTION',
  );
});

test('collection wording preserves all interpolation values and has complete English coverage', () => {
  for (const [original, collection] of Object.entries(labels)) {
    assert.deepEqual(
      [...original.matchAll(/\{\{\w+\}\}/g)].map((match) => match[0]).sort(),
      [...collection.matchAll(/\{\{\w+\}\}/g)].map((match) => match[0]).sort(),
      original,
    );
    assert.notEqual(translate('en', collection), collection, collection);
  }
  assert.equal(
    translate('en', sourceLabel('Sauvegarde : {{name}}', 'collection'), { name: 'My source' }),
    'Collection: My source',
  );
});
