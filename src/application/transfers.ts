import { buildTransfer, parseDedicatedServer } from '../domain/transfers.js';
import type { LibraryPort } from './service.js';

export class TransferService {
  constructor(private readonly library: LibraryPort) {}

  async exportSave(saveId: string, revision: string) {
    await this.library.saves();
    const save = await this.library.readSave(saveId);
    if (save.revision !== revision)
      throw Error('La sauvegarde a changé. Actualise avant de poursuivre.');
    return buildTransfer(save.ids, await this.library.scan(save.version));
  }

  async importServer(text: string) {
    const parsed = parseDedicatedServer(text);
    return buildTransfer(parsed.ids, await this.library.scan(), parsed.workshopIds);
  }
}
