import {
  buildProfileFragment,
  insertProfile,
  profileExists,
  deleteProfile,
  renameProfile,
  duplicateProfile,
  validateProfileName,
  type ProfilePreview,
} from '../domain/profiles.js';
import type { LibraryPort } from './service.js';

export interface ProfileStorePort {
  read(userDir: string): Promise<{
    text: string;
    exists: boolean;
    revision: string;
    contextId: string;
    modified?: string;
  }>;
  write(
    userDir: string,
    revision: string,
    text: string,
    validateSource: () => Promise<void>,
  ): Promise<{ backup?: string }>;
}
export interface ProfileMutationPort {
  profileUserDir(): Promise<string>;
  withProfileMutation<T>(operation: (userDir: string) => Promise<T>): Promise<T>;
}
export interface CollectionIdentityPort {
  collectionId(contextId: string, name: string): string;
}

export class ProfileService {
  constructor(
    private readonly library: LibraryPort & ProfileMutationPort,
    private readonly store: ProfileStorePort,
    private readonly identities?: CollectionIdentityPort,
  ) {}
  private async source(saveId: string, revision: string) {
    await this.library.saves();
    const save = await this.library.readSave(saveId);
    if (save.revision !== revision)
      throw Error('La sauvegarde a changé. Actualise avant de poursuivre.');
    return save;
  }
  async preview(saveId: string, revision: string, name: string): Promise<ProfilePreview> {
    const save = await this.source(saveId, revision);
    const profile = buildProfileFragment(name, save.ids);
    const snapshot = await this.store.read(await this.library.profileUserDir());
    return {
      ...profile,
      profileRevision: snapshot.revision,
      exists: profileExists(snapshot.text, snapshot.exists, profile.name),
    };
  }
  async export(
    saveId: string,
    revision: string,
    name: string,
    profileRevision: string,
    overwrite: boolean,
  ) {
    if (typeof profileRevision !== 'string' || !profileRevision || typeof overwrite !== 'boolean')
      throw Error('Requête d’export de profil invalide.');
    return this.library.withProfileMutation(async (userDir) => {
      const save = await this.source(saveId, revision);
      const profile = buildProfileFragment(name, save.ids);
      const snapshot = await this.store.read(userDir);
      if (snapshot.revision !== profileRevision)
        throw Error('Le fichier de profils a changé. Vérifie à nouveau l’aperçu.');
      const exists = profileExists(snapshot.text, snapshot.exists, profile.name);
      const next = insertProfile(snapshot.text, snapshot.exists, profile, overwrite);
      const result = await this.store.write(userDir, profileRevision, next, async () => {
        await this.source(saveId, revision);
      });
      return { ...result, created: !exists, replaced: exists };
    });
  }
  async delete(saveId: string, revision: string) {
    if (typeof saveId !== 'string' || !/^collection:[a-f0-9]{24}$/.test(saveId))
      throw Error('Seule une collection locale peut être supprimée.');
    if (typeof revision !== 'string' || !revision)
      throw Error('Requête de suppression de collection invalide.');
    return this.library.withProfileMutation(async (userDir) => {
      const source = (await this.library.saves()).find(
        (item) => item.id === saveId && item.kind === 'collection',
      );
      if (!source) throw Error('Collection locale introuvable. Actualise la liste.');
      const saved = await this.library.readSave(saveId);
      if (saved.kind !== 'collection')
        throw Error('Seule une collection locale peut être supprimée.');
      const snapshot = await this.store.read(userDir);
      if (saved.revision !== revision || snapshot.revision !== revision)
        throw Error('Le fichier de profils a changé. Vérifie à nouveau l’aperçu.');
      const next = deleteProfile(snapshot.text, snapshot.exists, source.name);
      const result = await this.store.write(userDir, revision, next, async () => {
        const current = await this.library.readSave(saveId);
        if (current.kind !== 'collection' || current.revision !== revision)
          throw Error('Le fichier de profils a changé. Vérifie à nouveau l’aperçu.');
      });
      if (!result.backup)
        throw Error(
          'Impossible d’enregistrer le profil. Vérifie les chemins et actualise l’aperçu.',
        );
      return { backup: result.backup, deletedId: saveId };
    });
  }
  rename(saveId: string, revision: string, name: string) {
    return this.changeName(saveId, revision, name, 'rename');
  }
  duplicate(saveId: string, revision: string, name: string) {
    return this.changeName(saveId, revision, name, 'duplicate');
  }
  private async changeName(
    saveId: string,
    revision: string,
    value: string,
    operation: 'rename' | 'duplicate',
  ) {
    if (typeof saveId !== 'string' || !/^collection:[a-f0-9]{24}$/.test(saveId))
      throw Error('Seule une collection locale peut être modifiée.');
    if (typeof revision !== 'string' || !revision)
      throw Error('Requête de modification de collection invalide.');
    const name = validateProfileName(value);
    const identities = this.identities;
    if (!identities) throw Error('La gestion des collections locales est indisponible.');
    return this.library.withProfileMutation(async (userDir) => {
      const source = (await this.library.saves()).find(
        (item) => item.id === saveId && item.kind === 'collection',
      );
      if (!source) throw Error('Collection locale introuvable. Actualise la liste.');
      const saved = await this.library.readSave(saveId);
      if (saved.kind !== 'collection')
        throw Error('Seule une collection locale peut être modifiée.');
      const snapshot = await this.store.read(userDir);
      if (saved.revision !== revision || snapshot.revision !== revision)
        throw Error('Le fichier de profils a changé. Vérifie à nouveau l’aperçu.');
      const transform = operation === 'rename' ? renameProfile : duplicateProfile;
      const next = transform(snapshot.text, snapshot.exists, source.name, name);
      const sourceId = identities.collectionId(snapshot.contextId, name);
      const result = await this.store.write(userDir, revision, next, async () => {
        const current = await this.library.readSave(saveId);
        if (current.kind !== 'collection' || current.revision !== revision)
          throw Error('Le fichier de profils a changé. Vérifie à nouveau l’aperçu.');
      });
      if (!result.backup)
        throw Error(
          'Impossible d’enregistrer le profil. Vérifie les chemins et actualise l’aperçu.',
        );
      return { backup: result.backup, name, sourceId };
    });
  }
}
