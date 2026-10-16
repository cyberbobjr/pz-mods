import { spawn } from 'node:child_process';
import path from 'node:path';
import type { ExplorerPort } from '../application/explorer.js';

export class WindowsExplorer implements ExplorerPort {
  async open(directory: string) {
    if (!path.isAbsolute(directory))
      throw Error('Impossible d’ouvrir ce dossier dans l’Explorateur Windows.');
    await new Promise<void>((resolve, reject) => {
      const child = spawn('explorer.exe', [directory], {
        shell: false,
        // This visible GUI window is explicitly requested by the user.
        windowsHide: false,
        stdio: 'ignore',
      });
      child.once('error', () =>
        reject(Error('Impossible d’ouvrir ce dossier dans l’Explorateur Windows.')),
      );
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
  }
}
