# Changelog

## Unreleased

### Added

- Add an **Auto-sort** button to the load-order editor for saves and local
  collections. It orders active mods using declared `require`, `loadAfter` and
  `loadBefore` constraints while preserving exact IDs and Workshop providers.
- Keep automatic sorting in an undoable draft, with existing validation,
  confirmation and backup protections before saving.
- Report cyclic constraints and blocked IDs without changing the draft.
- Add tests for automatic sorting, qualified references, cycles and preservation
  of active IDs.
- Add a French README at `README_fr.md`.

### Changed

- Rewrite `README.md` in English and update both language versions with current
  collection management, missing-reference cleanup and automatic sorting behavior.
