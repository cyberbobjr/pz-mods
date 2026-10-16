export type WritePhase = 'saving' | 'saved' | 'error';
export type SourceWrite = {
  id: string;
  name: string;
  phase: WritePhase;
  savedAt?: number;
  backup?: string;
  message?: string;
};
export type WriteState = { byId: Record<string, SourceWrite>; toastId?: string };
export type WriteEvent =
  | { type: 'dismiss' }
  | { type: 'idle'; id: string }
  | {
      type: WritePhase;
      id: string;
      name: string;
      backup?: string;
      message?: string;
      now?: number;
      silent?: boolean;
    };

export function sourceWriteReducer(state: WriteState, event: WriteEvent): WriteState {
  if (event.type === 'dismiss') return { ...state, toastId: undefined };
  if (event.type === 'idle') {
    const byId = { ...state.byId };
    delete byId[event.id];
    return { byId, toastId: state.toastId === event.id ? undefined : state.toastId };
  }
  const entry: SourceWrite = {
    id: event.id,
    name: event.name,
    phase: event.type,
    savedAt: event.type === 'saved' ? (event.now ?? Date.now()) : undefined,
    backup: event.type === 'saved' ? event.backup : undefined,
    message: event.type === 'error' ? event.message : undefined,
  };
  return {
    byId: { ...state.byId, [event.id]: entry },
    toastId: event.silent ? undefined : event.id,
  };
}
