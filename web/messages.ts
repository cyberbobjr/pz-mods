import type { Issue, LoadOrderViolation } from '../src/domain/mods';
import { translateCurrent } from './i18n';
import type { Translator } from './localization';
import { english } from './localization';

export function translateOrderViolation(issue: LoadOrderViolation, t: Translator) {
  return issue.kind === 'before'
    ? t('{{mod}} doit être chargé avant {{target}}.', { mod: issue.modId, target: issue.target })
    : t('{{mod}} doit être chargé après {{target}}.', { mod: issue.modId, target: issue.target });
}

export function translateIssue(issue: Issue, t: Translator) {
  switch (issue.kind) {
    case 'missing':
      return t('Mod actif dans la sauvegarde mais introuvable sur le disque.');
    case 'duplicate':
      return t(
        'Plusieurs installations fournissent cet identifiant ; priorité de chargement à vérifier.',
      );
    case 'incompatible':
      return t('Incompatibilité déclarée dans mod.info entre deux mods actifs.');
    case 'dependency':
      return issue.message.includes('installé mais')
        ? t('Prérequis installé mais inactif dans cette sauvegarde.')
        : t('Prérequis absent du disque et de la sauvegarde.');
    case 'version': {
      const values = issue.message.match(/^Version (.+) hors de la plage détectée (.+) - (.+)\.$/);
      return values
        ? t('Version {{version}} hors de la plage détectée {{min}} – {{max}}.', {
            version: values[1],
            min: values[2],
            max: values[3],
          })
        : t('La version du jeu est hors de la plage détectée pour ce mod.');
    }
  }
}

export function contentFallback(text: string, t: Translator) {
  if (text === 'Aucune description locale disponible.')
    return t('Aucune description locale disponible.');
  if (text === 'Ce mod est référencé par la sauvegarde mais ses fichiers sont introuvables.')
    return t('Ce mod est référencé par la sauvegarde mais ses fichiers sont introuvables.');
  return text;
}

export function translateError(message: unknown) {
  const text = typeof message === 'string' ? message : 'Erreur inattendue.';
  const blocked = text.match(
    /^Retrait bloqué : prérequis utilisés par (.+)\. Retire aussi ces mods si nécessaire\.$/,
  );
  if (blocked)
    return translateCurrent(
      'Retrait bloqué : prérequis utilisés par {{mods}}. Retire aussi ces mods si nécessaire.',
      { mods: blocked[1] },
    );
  const order = text.match(/^Nouvelle contrainte d’ordre non respectée : (.+)$/);
  if (order) {
    const constraints = [
      ...order[1].matchAll(/([^\s]+) doit être chargé (avant|après) ([^\s]+)\./g),
    ];
    return translateCurrent('Nouvelle contrainte d’ordre non respectée : {{constraints}}', {
      constraints: constraints.length
        ? constraints
            .map((match) =>
              translateOrderViolation(
                {
                  modId: match[1],
                  target: match[3],
                  kind: match[2] === 'avant' ? 'before' : 'after',
                  message: '',
                },
                translateCurrent,
              ),
            )
            .join(' ')
        : translateCurrent('Vérifiez les contraintes indiquées dans l’éditeur.'),
    });
  }
  const key =
    Object.entries(english).find(
      ([source, value]) => value === text && !source.includes('{{'),
    )?.[0] || text;
  return translateCurrent(key);
}
