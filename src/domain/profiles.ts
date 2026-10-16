export type ProfileFragment = {
  name: string;
  ids: string[];
  count: number;
  profileText: string;
  downloadText: string;
};
export type ProfilePreview = ProfileFragment & { profileRevision: string; exists: boolean };

function invalidCharacter(text: string) {
  return [...text].some((character) => {
    const code = character.codePointAt(0)!;
    return (
      code < 32 ||
      code === 127 ||
      code === 0x2028 ||
      code === 0x2029 ||
      (code >= 0xd800 && code <= 0xdfff)
    );
  });
}

export function validateProfileName(value: string) {
  if (typeof value !== 'string') throw Error('Nom de profil invalide.');
  const name = value.trim();
  if (
    !name ||
    [...name].length > 128 ||
    /[\\/:*?"<>|]/.test(name) ||
    invalidCharacter(value) ||
    name.toLowerCase().startsWith('!fav!')
  )
    throw Error('Nom de profil invalide.');
  return name;
}

export function buildProfileFragment(value: string, rawIds: string[]): ProfileFragment {
  const name = validateProfileName(value);
  if (rawIds.length > 10000) throw Error('Liste de mods trop volumineuse pour un profil.');
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const rawId of rawIds) {
    const id = rawId.trim().replace(/^\\+/, '');
    if (!id || rawId.length > 512 || /[;\\]/.test(id) || invalidCharacter(rawId))
      throw Error('Identifiant de mod incompatible avec le format des profils.');
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  const profileText = `${name}:${ids.map((id) => `${id};`).join('')}`;
  return { name, ids, count: ids.length, profileText, downloadText: `!fav!:\n${profileText}\n` };
}

type ProfileLine = { content: string; ending: string; start: number; end: number };
function readProfileLines(text: string, fileExists: boolean): ProfileLine[] {
  if (!fileExists) return [];
  if (text === '' || text === '\uFEFF') return [];
  if (/\r(?!\n)/.test(text) || invalidCharacter(text.replace(/[\r\n\t]/g, '')))
    throw Error('Format du fichier de profils non pris en charge.');
  const lines = [...text.matchAll(/([^\r\n]*)(\r\n|\n|$)/g)]
    .filter((match) => match[0].length > 0)
    .map((match) => ({
      content: match[1],
      ending: match[2],
      start: match.index!,
      end: match.index! + match[0].length,
    }));
  if (!lines.length || !lines[0].content.replace(/^\uFEFF/, '').startsWith('!fav!:'))
    throw Error('Format du fichier de profils non pris en charge.');
  return lines;
}

function targetLines(lines: ProfileLine[], name: string) {
  const matches = lines.filter(
    (line) =>
      line.content.indexOf(':') >= 0 && line.content.slice(0, line.content.indexOf(':')) === name,
  );
  if (matches.length > 1) throw Error('Plusieurs profils portent ce nom. Choisis un autre nom.');
  return matches;
}

export function profileExists(text: string, fileExists: boolean, name: string) {
  return targetLines(readProfileLines(text, fileExists), validateProfileName(name)).length === 1;
}

export function insertProfile(
  text: string,
  fileExists: boolean,
  profile: ProfileFragment,
  overwrite: boolean,
) {
  const lines = readProfileLines(text, fileExists);
  const [target] = targetLines(lines, profile.name);
  if (target && !overwrite)
    throw Error('Ce profil existe déjà. Confirme son remplacement ou choisis un autre nom.');
  if (target)
    return (
      text.slice(0, target.start) + profile.profileText + target.ending + text.slice(target.end)
    );
  if (!fileExists || !lines.length)
    return (text.startsWith('\uFEFF') ? '\uFEFF' : '') + profile.downloadText;
  const ending = lines.find((line) => line.ending)?.ending || '\n';
  return text + (text.endsWith('\n') ? '' : ending) + profile.profileText + ending;
}
