<div align="center">

# PZ Mods

**Your loadout, under control.**

A local Project Zomboid mod manager for single-player saves and local collections.

English → [Français](README_fr.md)

</div>

![PZ Mods library with fictional demonstration data](docs/screenshot-library.png)

## Getting started

Requires Windows, Steam Project Zomboid, and **Node.js 24+** with npm. No Steam API key is needed.

```powershell
git clone https://github.com/cyberbobjr/pz-mods.git
cd pz-mods
npm ci
npm run build
npm start
```

Open **http://localhost:4273** (or http://127.0.0.1:4273). Keep the terminal open; Ctrl+C stops the server. On Windows, double-click [`lancer.bat`](lancer.bat) to install dependencies when needed, build and open the app.

## Explore and diagnose

- Browse installed Steam Workshop and local mods in cards or a table. Workshop parents group their Zomboid submods, each with its own ID, activation state and position.
- Search, filter active/inactive/missing mods, and inspect declared requirements, incompatibilities, duplicate IDs and version ranges. Open a detected submod folder from its detail panel.
- Sort the display by name, update date or saved order. Sorting happens before pagination and keeps parent groups together. Display sorting does not change the saved load order.
- Choose 12, 24, 36, 60 or 100 parents per page. Language (English/French), four themes, sidebar state and navigation preferences persist in the browser.

Diagnostics use installed metadata. Declared incompatibilities are findings; possible collisions remain suspicions. Static analysis cannot guarantee conflict-free gameplay.

## Edit saves and local collections

The source selector separates single-player saves from collections stored in `<userDir>/Lua/pz_modlist_settings.cfg`. Favorites are excluded. Each source retains its own navigation preferences.

Add a mod ID, remove selected submods, or open **Edit load order**. Drag rows, use arrows or enter a position. Undo, redo and restore-original controls operate on the draft. Adding an ID appends it without installing its files or activating its requirements.

### Automatic load order

Click **Auto-sort** inside the load-order editor to arrange all active IDs using declared `require`, `loadAfter` and `loadBefore` constraints. Requirements precede their consumers. Original draft positions break ties between available choices. Search filters do not limit the sort.

The result remains an undoable draft. Select **Review and apply**, inspect the changes, close Project Zomboid and confirm saving. Existing revision checks, validation and backups apply. No mod is added, removed, downloaded or unsubscribed.

Cyclic constraints leave the draft unchanged and display blocked IDs, including downstream dependents. Missing requirements remain diagnostic issues; absent endpoints do not constrain sorting. Undeclared constraints cannot be inferred. Project Zomboid may recalculate a collection→s order when activating it.

### Collection management and missing references

Rename or duplicate a local collection using the source panel. Existing names are rejected. Renaming moves navigation preferences; duplication copies them.

In **Missing mods**, select missing references and confirm removal. Qualified references such as `123/MyMod` and `456/MyMod` remain distinct. Removing a reference absent from disk leaves unresolved requirements visible; installed requirements used by remaining mods stay protected. This removes references only, without deleting mod files or changing Steam subscriptions.

All writes require the game to be closed, check concurrent changes and create a backup before modifying an existing file. Collection edits preserve other profiles, favorites, unknown lines, encoding and line endings. New profile backups live in `<userDir>/backups/pz-mods/profiles/`, outside `Lua/`. Old backups are not moved or deleted automatically. The interface reports save progress, success time and failures.

## Import, export and Steam

**Import / export** previews actions before execution:

- Export server `.ini` fragments or JSON manifests. `Mods=` preserves Zomboid ID order; `WorkshopItems=` deduplicates Workshop parents.
- Copy a shareable native profile, download a standalone `.cfg`, or save a local profile while preserving other profiles and favorites.
- Analyze pasted or uploaded server lists. Only `Mods=` and `WorkshopItems=` are read; other settings and passwords are ignored.
- Review and confirm Steam subscriptions, or open Steam→s prefilled collection form, complete creation manually, then detect the collection and confirm adding selected parents.

```ini
Mods=ExampleCore;ExampleVehicles;ExampleOptionalUI
WorkshopItems=1234567890;2345678901
```

These are fictional IDs. The two lists do not correspond by position. Imports do not modify saves. Exported fragments are not complete server configurations: configure maps (`Map=`), world settings and local mods separately. Steam collections preserve neither submod activation nor load order; retain a manifest or server fragment too.

Steam account actions require Microsoft Edge or Google Chrome and an explicit confirmation. Sign-in uses a dedicated browser profile at `.cache/steam-profile/`; passwords, cookies and tokens never pass through the app→s HTTP API. Public metadata needs no account. Local projects cannot become Workshop subscriptions.

Unsubscribing affects a whole Workshop parent, not just one submod. Steam may retain downloaded files temporarily. Unsubscribing does not remove IDs from saves or collections.

## Configuration and caches

Under **Settings → Game folders**, configure the Zomboid user directory, Steam installation, saves, local mod directories and Workshop `steamapps/workshop/content/108600` directories. Only existing absolute directories are accepted. Empty fields restore automatic detection. Applying paths reloads inventory without moving game files or restarting.

Defaults use `%USERPROFILE%\Zomboid` and Steam→s `libraryfolders.vdf`. Development projects under `<userDir>/Workshop/<project>/Contents/mods` are also scanned. Paths persist in Git-ignored `.cache/settings.json`; appearance and navigation remain browser-local. Invalid configured paths fall back to automatic detection at startup.

Optional environment defaults:

```powershell
$env:PZ_USER_DIR = Join-Path $env:USERPROFILE 'Zomboid'
$env:STEAM_PATH = 'D:\Steam'
$env:PORT = '4273'
npm start
```

No `.env` file is required or automatically loaded. If changing the backend port during development, update the Vite proxy too.

Workshop metadata is cached in `.cache/workshop.json` for six hours, posters in `.cache/posters/` for seven days, and local inventory in memory for 30 seconds. **Refresh** forces a local inventory rescan. Previously cached Steam data remains available when Steam is unavailable. Stop the backend before clearing metadata/poster caches. Deleting `.cache/steam-profile/` signs out the dedicated browser.

## Development

Run `npm ci`, then use two terminals:

| Command                | Purpose                                    | Address               |
| ---------------------- | ------------------------------------------ | --------------------- |
| `npm run dev:backend`  | Fastify with source watching               | http://127.0.0.1:4273 |
| `npm run dev:frontend` | React/Vite development server              | http://127.0.0.1:5173 |
| `npm run check`        | UTF-8 checks, lint, types, tests and build | →                     |
| `npm run format:check` | Check Prettier formatting                  | →                     |
| `npm run format`       | Apply Prettier formatting                  | →                     |

Vite proxies `/api` to Fastify. Tests use temporary files and simulated Steam responses, never personal saves or live account mutations.

```text
src/domain/        Models and business rules
src/application/   Use cases and ports
src/adapters/      Filesystem, Steam, caches and HTTP server
web/               React UI; translations in web/locales/
test/              Domain, application, adapter and UI-logic tests
```

The approved lightweight hexagonal architecture is documented in [`AGENTS.md`](AGENTS.md). Dependencies point toward the domain; domain rules perform no disk or network access. Use strict TypeScript, ESLint, Prettier and UTF-8 text.

## Privacy

The server binds to the loopback interface and checks mutation origins. Saves, caches, dependencies and environment files are excluded from Git. Never share `.cache/steam-profile/` or credentials. The backend retrieves Steam metadata and posters; the browser may load Google Fonts. Local paths can appear in the interface and screenshots: review captures before sharing.

Independent community project, unaffiliated with The Indie Stone or Valve.
