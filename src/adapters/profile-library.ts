import { createHash } from 'node:crypto';
import type { LibraryPort } from '../application/service.js';
import type {
  ProfileMutationPort,
  ProfileStorePort,
  CollectionIdentityPort,
} from '../application/profiles.js';
import {
  buildProfileFragment,
  insertProfile,
  parseProfileCollections,
  type ProfileCollection,
} from '../domain/profiles.js';
import { isExactPermutation, matchesActiveId, type Save } from '../domain/mods.js';
import { validateAddedId } from '../domain/additions.js';

const collectionId = (contextId: string, name: string) =>
  `collection:${createHash('sha256').update(contextId).update('\0').update(name).digest('hex').slice(0, 24)}`;

/** Routes only opaque collection IDs to the native profile file; all other work stays local. */
export class ProfileLibrary implements LibraryPort, ProfileMutationPort, CollectionIdentityPort {
  private collectionsError?: string;
  constructor(
    private readonly local: LibraryPort & ProfileMutationPort,
    private readonly profiles: ProfileStorePort,
  ) {}
  collectionId(contextId: string, name: string) {
    return collectionId(contextId, name);
  }

  async saves(): Promise<Save[]> {
    const saves = (await this.local.saves()).map((save) => ({ ...save, kind: 'save' as const }));
    try {
      const snapshot = await this.profiles.read(await this.local.profileUserDir());
      const collections = parseProfileCollections(snapshot.text, snapshot.exists).map(
        (profile) => ({
          id: collectionId(snapshot.contextId, profile.name),
          name: profile.name,
          mode: 'Collection',
          kind: 'collection' as const,
          modified: snapshot.modified || new Date(0).toISOString(),
        }),
      );
      this.collectionsError = undefined;
      return [...saves, ...collections];
    } catch (error) {
      this.collectionsError =
        error instanceof Error ? error.message : 'Impossible de lire les collections locales.';
      return saves;
    }
  }

  private async collection(id: string, userDir: string) {
    if (!/^collection:[a-f0-9]{24}$/.test(id))
      throw Error('Collection locale introuvable. Actualise la liste.');
    const snapshot = await this.profiles.read(userDir);
    const profile = parseProfileCollections(snapshot.text, snapshot.exists).find(
      (item) => collectionId(snapshot.contextId, item.name) === id,
    );
    if (!profile) throw Error('Collection locale introuvable. Actualise la liste.');
    return { snapshot, profile };
  }

  async readSave(id: string): ReturnType<LibraryPort['readSave']> {
    if (!id.startsWith('collection:')) return { ...(await this.local.readSave(id)), kind: 'save' };
    const { snapshot, profile } = await this.collection(id, await this.local.profileUserDir());
    return { ids: [...profile.ids], revision: snapshot.revision, kind: 'collection' };
  }

  private async mutate(
    id: string,
    revision: string,
    transform: (profile: ProfileCollection) => string[],
  ) {
    return this.local.withProfileMutation(async (userDir) => {
      const { snapshot, profile } = await this.collection(id, userDir);
      if (snapshot.revision !== revision)
        throw Error('Le fichier de profils a changé. Vérifie à nouveau l’aperçu.');
      const next = insertProfile(
        snapshot.text,
        snapshot.exists,
        buildProfileFragment(profile.name, transform(profile)),
        true,
      );
      const result = await this.profiles.write(userDir, revision, next, async () => {});
      if (!result.backup)
        throw Error(
          'Impossible d’enregistrer le profil. Vérifie les chemins et actualise l’aperçu.',
        );
      return result.backup;
    });
  }

  remove(id: string, ids: string[], revision: string) {
    if (!id.startsWith('collection:')) return this.local.remove(id, ids, revision);
    return this.mutate(id, revision, (profile) => {
      const removed = (raw: string) => ids.some((requested) => matchesActiveId(requested, raw));
      if (ids.some((value) => !profile.ids.some((raw) => matchesActiveId(value, raw))))
        throw Error('Un mod demandé n’est pas actif.');
      return profile.ids.filter((raw) => !removed(raw));
    });
  }
  add(id: string, rawId: string, revision: string) {
    if (!id.startsWith('collection:')) return this.local.add(id, rawId, revision);
    return this.mutate(id, revision, (profile) => {
      const added = buildProfileFragment(profile.name, [validateAddedId(rawId)]).ids[0];
      if (profile.ids.includes(added)) throw Error('Ajout de mod invalide ou déjà présent.');
      return [...profile.ids, added];
    });
  }
  reorder(id: string, ids: string[], revision: string) {
    if (!id.startsWith('collection:')) return this.local.reorder(id, ids, revision);
    return this.mutate(id, revision, (profile) => {
      const normalized = buildProfileFragment(profile.name, ids).ids;
      if (normalized.length !== ids.length || !isExactPermutation(profile.ids, normalized))
        throw Error('Identifiants de réorganisation invalides.');
      return normalized;
    });
  }
  scan(version?: string, force?: boolean) {
    return this.local.scan(version, force);
  }
  image(key: string) {
    return this.local.image(key);
  }
  async status() {
    const status = await this.local.status();
    return {
      ...(status && typeof status === 'object' ? status : {}),
      ...(this.collectionsError ? { collectionsError: this.collectionsError } : {}),
    };
  }
  profileUserDir() {
    return this.local.profileUserDir();
  }
  withProfileMutation<T>(operation: (userDir: string) => Promise<T>) {
    return this.local.withProfileMutation(operation);
  }
}
