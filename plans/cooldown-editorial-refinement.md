# Cooldown Editorial Refinement

## Goal

Refine the Cooldown screen from a card-heavy dashboard into a quieter, editorial, information-first view. The top should communicate only what happened today and how today’s work was distributed. The bottom should show cumulative role progress through a tightly packed bubble visualization.

## Confirmed Product Decisions

- Visual direction: editorial minimal.
- Daily role spread: one proportional segmented strip with five compact role labels and counts, not five cards and not five separate progress bars.
- Cumulative task dots: uniform size. One completed task always contributes one equal visual unit.
- Cumulative labels: hidden by default and revealed through hover, keyboard focus, or tap.
- Roles with zero cumulative timestamped tasks do not appear in the packed chart.
- Existing dark One palette, typography, role colors, role editing, persistence behavior, and timestamp eligibility rules remain unchanged.
- Avoid motivational or interpretive copy. Labels should be factual and brief.

## Current Implementation Context

- `src/App.tsx` contains the Cooldown data derivation, `RoleBubbles`, the task and role types, and the Cooldown screen markup.
- `src/index.css` contains the dark theme tokens and all Cooldown styling.
- A completed task contributes only when `completedAt` exists. `todayCompleted` powers the daily summary, while `trackedCompleted` powers cumulative progress.
- The current top section uses three metric cards plus five role cards.
- The current cumulative chart already filters out empty roles and packs task dots and role clusters, but task-dot radius still varies by duration and the visual treatment remains glossy.

## Implementation Plan

### 1. Make the daily summary typographic and factual

Restructure the top daily section in `src/App.tsx`:

- Use a small `Today` eyebrow.
- Present the three values—completed tasks, focused minutes, and active roles—as a single horizontal metric row.
- Use large numerals and compact factual labels with subtle vertical dividers instead of bordered metric cards.
- Remove the `N tasks completed` headline duplication.
- Preserve the existing calculations:
  - completed tasks: `todayCompleted.length`
  - focused minutes: `todayMinutes`
  - active roles: `activeRoles`

The section should read as data, not as a congratulatory status message.

### 2. Replace role cards with a segmented daily spread

Replace `.role-cards` and its five articles with:

- One horizontal track.
- One colored segment per active role.
- Segment widths proportional to `todayByRole[role.id] / todayCompleted.length`.
- Zero-count roles should have no colored width in the track but remain present in the label row so the five-role framework stays legible.
- A compact five-column legend below the strip containing:
  - role color dot
  - role name
  - today’s count
- If no tasks were completed today, render a neutral empty track and all five labels with zero counts.

Implementation details:

- Use a small local `RoleSpread` component or inline semantic section in `App.tsx`; do not add a new dependency.
- Dynamic segment proportions may use a typed CSS custom property or `flexGrow` derived from integer counts. Role color must continue to come from the existing `.bubble-{roleId}` classes.
- Add an accessible text label to the track summarizing the counts for all five roles.
- Keep the legend in a five-column row on desktop. On narrow screens, allow horizontal overflow rather than wrapping it into an uneven grid.

### 3. Use true equal-unit close packing for task dots

Replace duration-based task radii in `packTasks`:

- Every task dot uses one constant radius.
- Do not encode duration in dot area.
- Preserve task title and duration in the task dot’s accessible `<title>`.

Replace the current angular candidate search with deterministic hexagonal close packing:

- Generate axial hex-grid coordinates in expanding rings around the origin.
- Convert axial coordinates to SVG `x/y` positions with center spacing equal to two dot radii plus a very small visual gap.
- Sort/generated order must be deterministic so bubbles do not jump between renders.
- Assign tasks in stable order, using task ID as the final tie breaker.
- This creates visibly touching, honeycomb-like packing rather than loose spiral placement and scales linearly as cumulative history grows.

### 4. Make each outer role circle mathematically follow its dots

After task positions are generated:

- Compute a deterministic minimum enclosing circle around the task-dot centers.
- Shift all task positions by the enclosing circle’s center so the cluster is centered correctly.
- Set the outer role radius to:
  - enclosing center radius
  - plus the constant task-dot radius
  - plus only a small fixed breathing gap
- For one task, the outer role circle should be only slightly larger than that one dot.
- For two tasks, the outer circle should visibly wrap exactly two adjacent equal dots, with no arbitrary minimum diameter.
- Do not restore a minimum role radius.

A simple deterministic incremental minimum-enclosing-circle implementation is sufficient:

- start with the first point
- rebuild from one point when a later point falls outside
- rebuild from a point pair when required
- rebuild from a point triple using the circumcircle when required

The task list is stable and local, so the result should be deterministic without randomization.

### 5. Keep role clusters contact-packed

Retain the existing five-node role packing concept, with these adjustments:

- Input only roles that contain at least one eligible cumulative task.
- Pack outer circles with a very small consistent gap.
- Recompute chart bounds from the packed outer circles and fit the result into the existing responsive SVG view box.
- Reserve a small safe margin around the fitted group for focus outlines and the interaction label.
- Do not use fixed role positions.

### 6. Restyle the cumulative chart with editorial restraint

Update the cumulative section and SVG styling:

- Section heading: `Cumulative`.
- Supporting label: `One dot per completed task`.
- Remove the glass-like sheen, bloom, heavy blur, and decorative glow.
- Use:
  - low-opacity role-colored outer fills
  - crisp role-colored outer strokes
  - solid, brighter equal task dots
  - little or no drop shadow
- Remove always-visible role labels from below clusters.
- Keep the chart on an open or barely separated surface; avoid nested heavy cards.
- The visual hierarchy should come from spacing, type, and contrast rather than multiple borders.

### 7. Add interaction-only role labels

Inside `RoleBubbles`, track the selected role locally for touch interaction.

For each cluster:

- Make the SVG group keyboard focusable.
- Add an accessible label such as `Work, 12 completed tasks`.
- Reveal a compact label containing the role name and cumulative task count when:
  - the cluster is hovered
  - the cluster receives keyboard focus
  - the cluster is tapped/clicked
- Enter and Space should toggle the selected label.
- Tapping another cluster transfers selection.
- Tapping the selected cluster again dismisses it.
- The label should be positioned near the selected cluster while remaining inside the SVG’s safe visual bounds.
- Individual task circles retain `<title>` text with task title and duration.
- Respect `prefers-reduced-motion`; no new essential animation is required.

### 8. Responsive behavior

Desktop:

- Daily metrics, segmented strip, and five labels remain visible above the cumulative chart.
- Cumulative bubbles receive the majority of vertical space.

Mobile:

- Keep the metric row as three equal columns with compact typography.
- Keep the segmented track full width.
- Keep all five role labels in one horizontal row with overflow if necessary.
- Let the cumulative chart scale to the viewport without introducing horizontal page scroll.
- Preserve the existing footer wrapping and safe-area behavior.

### 9. Remove superseded styles and code

Delete styles and markup no longer used by:

- `.role-cards`
- card-specific daily metric borders/backgrounds
- glossy bubble sheen/glow treatment
- always-visible `.bubble-caption`
- stale result bar or prior role-distribution selectors

Keep changes limited to `src/App.tsx` and `src/index.css` unless verification reveals a direct dependency.

## Edge Cases

- No completed tasks today:
  - all daily metrics show zero
  - segmented strip is neutral/empty
  - all five legend counts show zero
- No cumulative timestamped tasks:
  - chart area shows the factual empty state `No completed tasks recorded yet.`
  - no empty role bubbles are rendered
- One active cumulative role:
  - center the single cluster
  - fit it without scaling it to an excessively large decorative bubble
- One completed task in a role:
  - one task dot and a narrowly padded outer role circle
- Large cumulative history:
  - hex packing remains deterministic and performant
  - SVG fitting keeps all clusters visible
- Renamed roles:
  - daily labels, accessible labels, and interaction labels use current role names
- Long role names:
  - compact legend and interaction label truncate visually if necessary while preserving the full accessible name

## Verification

1. Run `pnpm build`.
2. Run `git diff --check`.
3. Search changed files for removed stale selectors and old motivational copy.
4. Manually verify in the existing preview:
   - zero daily and zero cumulative state
   - one task in one role
   - two tasks in one role
   - tasks distributed across all five roles
   - role with zero cumulative tasks is absent
   - equal dot size regardless of task duration
   - proportional daily strip
   - hover, keyboard focus, Enter/Space, and tap label behavior
   - desktop and narrow mobile layouts
5. Confirm no development server was started and no unrelated files were changed.

## Success Criteria

- The screen reads immediately as “today’s facts” above “cumulative progress.”
- The top section contains no motivational or interpretive headline.
- The daily role spread is one restrained segmented strip, not a collection of cards or rows.
- Every cumulative task is represented by one equal-sized, tightly packed dot.
- Outer role circles closely wrap their actual dots and never use an arbitrary minimum size.
- Empty cumulative roles are not rendered.
- Cluster identity is available on hover, focus, and tap without permanently cluttering the chart.
- The result feels quieter, more deliberate, and more native to the existing One product.
