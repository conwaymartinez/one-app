# Cooldown Role Radar Redesign

## Goal

Replace the Cooldown tab’s task-summary card with a focused end-of-day role evaluation. The experience should borrow the calm, luminous, low-judgment feeling of Apple Health’s mental-health flow while using a five-axis radar/spider chart suited to the existing dark “One” product. Users will rate five roles by dragging chart vertices, may rename the roles, and will have the current day’s evaluation saved locally.

## Confirmed Product Decisions

- Default roles: **Self, Partner, Family, Friend, Work**.
- Keep exactly five roles, but allow all five labels to be renamed.
- Daily scoring happens by directly manipulating the five chart vertices.
- Use a discrete **1–5** scale represented by five concentric rings; dragging snaps to the nearest level.
- Persist evaluations by local calendar day in `localStorage`.
- Reload today’s saved evaluation when Cooldown is reopened.
- Do not add history browsing, date navigation, trends, freeform reflection, or task-summary metrics in this iteration.
- “No text entry” applies to the daily evaluation itself. Text inputs appear only inside the explicit role-name editing mode.

## Files to Change

### `src/App.tsx`

Add the data model, persistence, chart component, pointer/keyboard interactions, editable-role flow, and replace the current Cooldown JSX.

### `src/index.css`

Add the radar-chart, luminous Cooldown surface, editing panel, interaction-state, and responsive styles. Reuse the app’s existing font setup, CSS variables, Button/Icon primitives, ritual shell, and dark visual language rather than introducing a dependency or a second design system.

No new package is required.

## Data Model and Persistence

### Stable role configuration

Add a stable role ID union and role type:

```ts
type RoleId = "self" | "partner" | "family" | "friend" | "work"
type Role = { id: RoleId; name: string }
```

Seed with the five confirmed defaults. Persist the current global role names under:

```text
one-cooldown-roles
```

On initialization:

- Parse and validate the stored value defensively.
- Accept it only if all five known IDs exist and each has a non-empty string name.
- Otherwise fall back to the defaults.
- Keep IDs and chart positions stable when labels are renamed.

### Daily evaluation records

Use a record keyed by a local `YYYY-MM-DD` date string:

```ts
type CooldownEvaluation = {
  date: string
  scores: Record<RoleId, number>
  roleNames: Record<RoleId, string>
  updatedAt: string
}

type CooldownEvaluations = Record<string, CooldownEvaluation>
```

Persist the collection under:

```text
one-cooldown-evaluations
```

Implementation details:

- Build the day key from local date parts rather than `toISOString()`, so late-evening entries do not shift days because of UTC.
- Initialize a new day at score `3` on every axis, matching the neutral midpoint pattern of the Apple Health reference and ensuring every vertex is immediately draggable.
- Clamp loaded values to integers from 1 through 5; fall back to 3 for missing or invalid scores.
- Store a `roleNames` snapshot with each evaluation so future history UI can preserve the labels used on that date even if global labels are later renamed.
- Auto-save the current day whenever a score changes, including the current role-name snapshot and a fresh `updatedAt`.
- Persist global role-name edits separately. When names are saved, also refresh today’s record snapshot without changing its scores.
- Keep the existing “Finish the day” action as a close/confirmation action; it returns to the planner and shows the existing toast. It does not become the only save point, so accidental closure or refresh does not lose changes.

## Radar Chart Component

Create a focused local component in `src/App.tsx`, for example `RoleRadar`, instead of adding a chart library.

### Geometry

- Render one responsive square SVG with a five-sided coordinate system.
- Position the first role at the top, then place the remaining roles clockwise at equal 72-degree intervals.
- Draw five concentric pentagonal rings and five center-to-edge spokes.
- Convert each 1–5 score into 20%, 40%, 60%, 80%, or 100% of the available chart radius.
- Build the evaluated shape as a closed polygon through the five score points.
- Use the existing lavender/blue palette for a translucent fill, brighter outline, and restrained glow. Keep rings and spokes subtle so the data shape remains dominant.
- Place each role label outside its axis. Show the current numeric score adjacent to the label or handle without adding prose-heavy controls.
- Ensure long customized names truncate or wrap safely and do not force the SVG wider than the card.

### Pointer and touch manipulation

Each vertex gets a visible handle plus a larger transparent hit target.

On pointer down:

- Capture the pointer on that handle.
- Mark that role as active.
- Prevent chart panning while the vertex is being manipulated.

On pointer move:

- Convert the pointer from client coordinates into SVG coordinates using the SVG bounding box/viewBox relationship.
- Project the pointer vector onto the active role’s fixed axis so sideways movement does not rotate or distort the axis.
- Clamp the projected radius to levels 1–5.
- Snap to the nearest integer level and update only that role’s score.

On pointer up/cancel:

- Release capture and clear the active visual state.
- Leave the snapped score in place; persistence occurs through the score state effect.

Set touch behavior narrowly on the draggable targets/chart interaction area so mobile dragging is reliable without disabling unrelated page scrolling.

### Keyboard and screen-reader support

Treat each vertex as a slider:

- Give it an accessible label such as `Self rating`.
- Expose `aria-valuemin="1"`, `aria-valuemax="5"`, and the current `aria-valuenow`.
- Support Arrow Up/Right to increase, Arrow Down/Left to decrease, Home for 1, and End for 5.
- Use focus-visible and active-handle styling at least as clear as hover styling.
- Include a short visible instruction above or below the chart: “Drag each point to rate how well you fed that role.”
- Do not rely on color alone; the handle position, number, and accessible value all communicate the score.

## Cooldown Experience

Replace the existing Cooldown content only; preserve the app header, planner, Daily Brief, task/tag behavior, and close navigation.

### Content hierarchy

Use the existing ritual backdrop and card as the base, with a slightly wider Cooldown-specific card if needed:

1. Existing close button.
2. Moon icon treatment and “Daily cooldown” eyebrow.
3. Heading: **“How did you feed your roles today?”**
4. Supporting copy emphasizing reflection without judgment and briefly explaining the drag interaction.
5. The luminous five-axis radar chart as the visual focus.
6. A compact status/footer row with:
   - subtle auto-save feedback such as “Saved for today” after interaction,
   - a secondary **Edit roles** action,
   - the primary **Finish the day** action.

Remove the current three metric cards and completion meter from Cooldown; they no longer match the feature’s purpose.

### Visual direction

- Keep the current dark app and ritual card rather than reproducing Apple’s light-blue screens literally.
- Add a soft blue/lavender radial wash inside the Cooldown card/chart region, layered behind the chart and clipped to the surface.
- Use translucent fills, soft blur/glow, fine rings, and generous negative space to evoke Apple Health’s calm mental-health visualization.
- Avoid the multicolor infographic appearance of the second reference; use it only as structural guidance for axis/radar layout.
- Reuse existing CSS variables wherever possible. Add a small number of semantic Cooldown variables only if the current palette cannot express chart fill, line, and glow cleanly.
- Keep animation restrained: a short shape/handle transition for keyboard changes, disabled or effectively removed under the existing `prefers-reduced-motion` rule.

## Role Name Editing

The **Edit roles** action switches the lower chart area into a compact inline editor within the Cooldown card; do not open a new app-wide workflow.

- Show five labeled text inputs in stable chart order.
- Seed a separate draft copy so Cancel can discard unsaved edits.
- Provide **Cancel** and **Save roles** actions.
- Trim values on save.
- Require all five names to be non-empty and unique after case-insensitive trimming.
- Cap each name at 24 characters to protect chart label layout.
- Keep Save disabled while invalid and show concise inline guidance for blank or duplicate names.
- Saving updates global role configuration and today’s evaluation snapshot while retaining all scores.
- Returning to chart mode immediately displays the new labels.

## Responsive Behavior

### Desktop/tablet

- Keep the chart centered and large enough for precise dragging.
- Allow the Cooldown ritual card to be modestly wider than the current 720px shell, without changing the Daily Brief width.
- Keep controls in one balanced footer row when space permits.

### Mobile

- Fit the full chart within the viewport width with labels kept inside the card’s safe area.
- Reduce decorative spacing before reducing handle hit targets.
- Maintain at least a comfortable touch target around every vertex even if the visible dot is smaller.
- Stack or wrap footer controls so the primary action remains obvious.
- Make the role editor one column and keep inputs/actions reachable above the existing bottom navigation.
- Verify the outer ritual page can still scroll when needed and that dragging a handle does not scroll the page.

## Error and Edge-Case Handling

- Malformed `localStorage` JSON must never prevent app rendering; use defaults and replace data on the next valid update.
- Ignore unknown role IDs in stored configuration/evaluations.
- Clamp out-of-range or non-numeric stored scores.
- A renamed role never changes its axis or disconnects its historical score because identity is ID-based.
- Rapid pointer movement outside the chart remains controlled through pointer capture.
- Closing Cooldown mid-drag leaves the latest snapped score saved through normal state persistence.
- Storage failure should not block interaction. Wrap writes in `try/catch`; the UI may continue without claiming a successful save if a write fails.

## Verification

### Automated

Run the repository’s production build:

```sh
pnpm build
```

There is no test script in `package.json`; do not invent one. Ensure TypeScript/Vite compilation catches JSX, SVG, event, and state typing issues.

### Manual preview checks

Use the already-running Figma Make preview; do not start another development server.

1. Open Cooldown and confirm the old task metrics are gone.
2. Confirm all five defaults appear in the intended clockwise order and begin at level 3 on a fresh date.
3. Drag each vertex inward and outward with mouse input; confirm it stays on its own axis and snaps from 1 through 5.
4. Repeat on a narrow/mobile viewport with touch-style pointer interaction; confirm chart dragging does not move the whole page.
5. Focus every handle by keyboard and verify arrows, Home, End, focus styling, and exposed slider values.
6. Reload after changing scores and confirm today’s exact five values return.
7. Edit all five names, save, reload, and confirm the names persist without resetting scores.
8. Confirm blank or duplicate names cannot be saved and Cancel restores the previous names.
9. Corrupt or remove the Cooldown storage keys in browser storage and confirm the screen safely returns to valid defaults.
10. Finish the day and confirm it returns to the planner with the existing toast behavior.
11. Check Daily Brief, planner layout, and mobile bottom navigation for regressions.
12. Check reduced-motion mode and confirm no meaningful interaction depends on animation.

## Out of Scope

- Browsing or editing prior days.
- Trends, streaks, averages, comparisons, or charts across dates.
- Connecting role ratings to tasks, tags, or planned/completed time.
- Adding/removing roles beyond the fixed five.
- Freeform journal text, emotion tags, notes, or AI interpretation.
- Cloud sync, accounts, or cross-device storage.
