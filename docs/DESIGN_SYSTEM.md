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

`tokens/themes.css` defines the approved light and dark semantic palettes. Light
is the default; the day/night shell toggle is available to every role in the
expanded desktop sidebar and mobile menu footer, with an accessible name but no
visible label. The desktop sidebar places the toggle left of language; mobile
reverses that order. A collapsed sidebar shows only compact language choices.
Full-width choices use each language's own name.
`frontend/src/app/theme.js` persists the choice in browser local storage; blocked
storage does not prevent switching. Schedule palette keys remain unchanged, with
CSS `light-dark()` adapting their rendered colors to the selected theme.
Dark mode uses brighter text, saturated status surfaces and blue accents for
selected tabs. `--action-secondary-background` separates secondary buttons
from cards while keeping their hover and active states.
`frontend/src/app/theme-layout.css` styles the admin overview and theme control.
Navigation keeps visible labels and uses 20 px icons; admin overview shortcuts
use 22 px icons. The same metaphor follows a feature across roles: calendar
for schedules, wallet for payments, ticket for subscriptions, and people for
groups. Trainer sessions use a swimmer; history and help have distinct icons.
Primary action buttons reuse these icons while retaining their text labels.

Local development appearance changes are saved through **Оформление** in the admin CRM.
The editor writes `design/appearance.json` and generated `design/tokens/appearance.css`;
the CSS is copied to the frontend runtime directory for immediate preview. Existing
color and spacing tokens remain the defaults when appearance values are empty.
The editor also stores per-element overrides scoped to a role/view and a DOM path.
The route marker is set in `AppShell.jsx`; changing the screen's DOM structure may
require reselecting an element in the editor.
Ctrl+click selects nested text within a clickable block. Element spacing uses
independent top/right/bottom/left padding and margin values.
Leaf text can be replaced in the editor; its original text hash guards against
replacing a different value after dynamic data changes. Desktop preview supports
fixed virtual widths and scales them to the available editor space.
The editor's collapsible Structure outline reveals a selected element's ancestor
path and direct children; clicking a row selects that exact DOM element. The
outline scrolls within a fixed panel. Selected elements can be hidden (keep
space), removed from the layout (release space), or restored. The editor can
append simple text or block elements to a selected container, and copy and paste
their text plus explicit appearance overrides. These local additions are stored
as validated `blocks` in `design/appearance.json` and rendered as text nodes;
they do not create interactive CRM controls.

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
