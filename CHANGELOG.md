# Changelog

## [1.0.0] - 2026-10-17

First functional release of PZ Mods.

### Release scope

- Browse and diagnose installed Workshop and local mods for single-player saves
  and native local collections.
- Add and remove mod references, edit load order manually or automatically, and
  rename or duplicate local collections.
- Protect file changes with revision checks, game-closed guards, confirmations
  and backups; preserve unrelated profiles and favorites.
- Import and export server lists and native profiles, with optional confirmed
  Steam subscription and collection actions.
- Configure library folders and use a persistent English or French interface
  with themes, filters and pagination.

### Limitations

- Diagnostics and automatic sorting use declared metadata; they cannot guarantee
  conflict-free gameplay or infer undeclared load-order constraints.
- Project Zomboid may recalculate collection order when activating a profile.
- Windows, Steam Project Zomboid and Node.js 24 or newer are required.

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
