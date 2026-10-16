import {
  buildProfileFragment,
  insertProfile,
  profileExists,
  type ProfilePreview,
} from '../domain/profiles.js';
import type { LibraryPort } from './service.js';

export interface ProfileStorePort {
  read(userDir: string): Promise<{ text: string; exists: boolean; revision: string }>;
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

export class ProfileService {
  constructor(
    private readonly library: LibraryPort & ProfileMutationPort,
    private readonly store: ProfileStorePort,
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
}
