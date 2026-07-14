# SwimCRM design system

## Source of truth

`design/` is the source of truth for the SwimCRM design system:

- `design/tokens/`
- `design/styles.css`
- `design/components/`
- `design/assets/icons.jsx`
- `design/ui_kits/`
- generated authoring artifacts such as `design/_ds_bundle.js`

The production frontend imports a small runtime copy from `frontend/src/design/`
because Vite serves assets from inside `frontend/src`.

## Runtime copy

`frontend/src/design/` is not the place to edit the design system by hand. It
contains the files required by `frontend/src/App.jsx`:

- `styles.css`
- `tokens/*.css`
- `_ds_bundle.js`
- `ui_kits/shared/kit.css`

Sync after changing `design/`:

```powershell
scripts\sync-design-frontend.cmd
```

Then verify:

```powershell
cd frontend
npm.cmd run build
```

## Cleanup decision

The duplicate-looking files are intentionally kept:

- `design/` is needed for design authoring, previews, component docs, and UI-kit
  HTML artifacts;
- `frontend/src/design/` is needed by the production Vite app.

Do not remove either side unless the frontend is changed to consume a packaged
design-system dependency instead of local runtime assets.
