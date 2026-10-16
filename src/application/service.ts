import {
  analyse,
  removalBlockers,
  validateLoadOrder,
  isExactPermutation,
  type Mod,
  type Save,
  type WorkshopDetail,
} from '../domain/mods.js';
import { previewAddition, validateAddedId } from '../domain/additions.js';
export interface LibraryPort {
  scan(version?: string, force?: boolean): Promise<Mod[]>;
  saves(): Promise<Save[]>;
  readSave(id: string): Promise<{ ids: string[]; revision: string; version?: string }>;
  remove(id: string, ids: string[], revision: string): Promise<string>;
  reorder(id: string, ids: string[], revision: string): Promise<string>;
  add(id: string, rawId: string, revision: string): Promise<string>;
  image(key: string): Promise<string | undefined>;
  status(): Promise<unknown>;
}
export interface WorkshopPort {
  details(ids: string[]): Promise<Record<string, WorkshopDetail>>;
}
export type Poster = { bytes: Uint8Array; contentType: string };
export interface PosterPort {
  get(url: string): Promise<Poster | undefined>;
}
export class ModService {
  constructor(
    private library: LibraryPort,
    private workshop: WorkshopPort,
    private posters: PosterPort,
  ) {}
  async overview(saveId?: string, refresh = false) {
    const saves = await this.library.saves();
    const selected = saveId || saves[0]?.id;
    const save = selected ? await this.library.readSave(selected) : undefined;
    const mods = await this.library.scan(save?.version, refresh);
    const active = save?.ids || [];
    return {
      saves,
      selected,
      mods,
      active,
      revision: save?.revision,
      version: save?.version,
      issues: analyse(mods, active, save?.version),
      status: await this.library.status(),
    };
  }
  async remove(saveId: string, ids: string[], revision: string) {
    if (!ids.length) throw Error('Aucun mod sélectionné.');
    const save = await this.library.readSave(saveId);
    if (save.revision !== revision)
      throw Error('La sauvegarde a changé. Actualise avant de poursuivre.');
    const mods = await this.library.scan(save.version);
    const blockers = removalBlockers(mods, save.ids, ids);
    if (blockers.length)
      throw Error(
        `Retrait bloqué : prérequis utilisés par ${blockers.join(', ')}. Retire aussi ces mods si nécessaire.`,
      );
    return { backup: await this.library.remove(saveId, ids, revision) };
  }
  async validateAdd(saveId: string, id: string, revision: string) {
    const requested = validateAddedId(id);
    await this.library.saves();
    const save = await this.library.readSave(saveId);
    if (save.revision !== revision)
      throw Error('La sauvegarde a changé. Actualise avant de poursuivre.');
    return previewAddition(
      await this.library.scan(save.version, true),
      save.ids,
      requested,
      save.version,
    );
  }
  async add(saveId: string, id: string, revision: string) {
    const preview = await this.validateAdd(saveId, id, revision);
    if (preview.alreadyActive) return { id: preview.id, alreadyActive: true };
    return {
      id: preview.id,
      alreadyActive: false,
      backup: await this.library.add(saveId, preview.id, revision),
    };
  }
  async details(ids: string[]) {
    const details = await this.workshop.details(ids);
    return Object.fromEntries(
      Object.entries(details).map(([id, detail]) => [
        id,
        {
          ...detail,
          preview_url: detail.preview_url ? `/api/workshop/${id}/poster` : '',
        },
      ]),
    );
  }
  private async orderContext(saveId: string, ids: string[], revision: string) {
    const save = await this.library.readSave(saveId);
    if (save.revision !== revision)
      throw Error('La sauvegarde a changé. Actualise avant de poursuivre.');
    if (!isExactPermutation(save.ids, ids))
      throw Error(
        'L’ordre doit contenir exactement les identifiants originaux, sans ajout ni suppression.',
      );
    const mods = await this.library.scan(save.version);
    const violations = validateLoadOrder(mods, ids);
    const existingViolations = validateLoadOrder(mods, save.ids);
    const key = (issue: { modId: string; target: string; kind: string }) =>
      JSON.stringify([issue.modId, issue.target, issue.kind]);
    const existing = new Set(existingViolations.map(key));
    const newViolations = violations.filter((issue) => !existing.has(key(issue)));
    return { violations, existingViolations, newViolations };
  }
  async validateOrder(saveId: string, ids: string[], revision: string) {
    return this.orderContext(saveId, ids, revision);
  }
  async reorder(saveId: string, ids: string[], revision: string) {
    const { newViolations: added } = await this.orderContext(saveId, ids, revision);
    if (added.length)
      throw Error(
        `Nouvelle contrainte d’ordre non respectée : ${added.map((issue) => issue.message).join(' ')}`,
      );
    return { backup: await this.library.reorder(saveId, ids, revision) };
  }
  async poster(id: string) {
    if (!/^\d+$/.test(id)) return undefined;
    const details = await this.workshop.details([id]);
    return details[id]?.preview_url ? this.posters.get(details[id].preview_url) : undefined;
  }
  image(key: string) {
    return this.library.image(key);
  }
}
