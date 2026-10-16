import collectionLabels from './source-wording.json';

export type SourceKind = 'save' | 'collection';
const labels: Record<string, string> = collectionLabels;

/** Global messages stay unchanged; only reviewed source labels have variants. */
export function sourceLabel(key: string, kind: SourceKind) {
  return kind === 'collection' ? labels[key] || key : key;
}
