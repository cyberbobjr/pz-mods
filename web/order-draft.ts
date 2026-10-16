export type OrderDraft = { past: string[][]; ids: string[]; future: string[][] };
export type OrderAction =
  | { type: 'move'; from: number; to: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; ids: string[] };

export function orderDraftReducer(state: OrderDraft, action: OrderAction): OrderDraft {
  if (action.type === 'undo') {
    const previous = state.past.at(-1);
    return previous
      ? { past: state.past.slice(0, -1), ids: previous, future: [state.ids, ...state.future] }
      : state;
  }
  if (action.type === 'redo') {
    const next = state.future[0];
    return next
      ? { past: [...state.past, state.ids], ids: next, future: state.future.slice(1) }
      : state;
  }
  let ids: string[];
  if (action.type === 'reset') ids = [...action.ids];
  else {
    const { from, to } = action;
    if (
      !Number.isInteger(from) ||
      !Number.isInteger(to) ||
      from < 0 ||
      from >= state.ids.length ||
      to < 0 ||
      to >= state.ids.length ||
      from === to
    )
      return state;
    ids = [...state.ids];
    ids.splice(to, 0, ids.splice(from, 1)[0]);
  }
  if (ids.every((id, index) => id === state.ids[index])) return state;
  return { past: [...state.past, state.ids].slice(-50), ids, future: [] };
}
