export interface DirectoryResolverPort {
  resolveModDirectory(key: string): Promise<string | undefined>;
}
export interface ExplorerPort {
  open(directory: string): Promise<void>;
}

export class ExplorerService {
  constructor(
    private readonly directories: DirectoryResolverPort,
    private readonly explorer: ExplorerPort,
  ) {}
  async openModFolder(key: unknown) {
    if (typeof key !== 'string' || !/^[a-f0-9]{24}$/.test(key))
      throw Error('Dossier de mod introuvable. Actualise l’inventaire.');
    const directory = await this.directories.resolveModDirectory(key);
    if (!directory) throw Error('Dossier de mod introuvable. Actualise l’inventaire.');
    await this.explorer.open(directory);
    return { opened: true };
  }
}
