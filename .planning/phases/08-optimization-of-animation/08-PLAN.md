---
phase: 8
name: Optimization of Animation
wave: 1
depends_on: []
files_modified: [ui/styles.css, ui/app.js]
autonomous: true
requirements: [REQ-8.1, REQ-8.2]
---

# 📝 Phase 8 Plan: Animation Optimization

## 🎯 Objectives
Achieve GPU-accelerated 60fps performance for the "Aurora" mesh gradient and UI transitions by moving to compositor-only properties (`transform`, `opacity`) and implementing an isolated backplane.

## 📋 Prerequisites
- Phase 7 (Accessibility) completed and verified.
- Chrome DevTools available for FPS/Paint auditing.

## 🎯 Must-Haves (Goal-Backward Verification)
- [ ] UI background remains at 60fps during heavy worker processing.
- [ ] No "Paint Flashing" occurs on the background layer during the mesh animation.
- [ ] Theme transitions and solid-background modes work seamlessly with the new pseudo-element structure.
- [ ] Reduced motion settings strictly disable the background transform animation.

## 🛠️ Tasks

<wave number="1">

<task>
<id>08-01-01</id>
<title>Isolate Background Mesh to Pseudo-element</title>
<read_first>
- ui/styles.css
- .planning/phases/08-optimization-of-animation/08-RESEARCH.md
</read_first>
<action>
1. Modify `body` in `ui/styles.css` to remove `background-image`, `background-size`, and `animation: meshpan`.
2. Add `body::before` pseudo-element with:
    - `content: ''`
    - `position: fixed; top: -50%; left: -50%; width: 200%; height: 200%; z-index: -1;`
    - `background-image` containing the radial gradients from the current `body` implementation.
    - `background-size: 100% 100%`
3. Update theme declarations (`[data-theme="..."]`) to apply `--mesh-*` variables to `body::before` instead of `body`.
4. Ensure `body.solid-bg::before` sets `display: none` to support solid color themes.
</action>
<acceptance_criteria>
- `ui/styles.css` has `body::before` with `z-index: -1`.
- `body` selector no longer contains `animation: meshpan`.
- `body.solid-bg::before` contains `display: none`.
</acceptance_criteria>
</task>

<task>
<id>08-01-02</id>
<title>Implement Compositor-Only Mesh Animation</title>
<read_first>
- ui/styles.css
</read_first>
<action>
1. Replace `meshpan` @keyframes with a new `meshpan-gpu` keyframes:
    - 0%: `transform: translate3d(2%, 2%, 0) scale(1.0);`
    - 50%: `transform: translate3d(-2%, -2%, 0) scale(1.05);`
    - 100%: `transform: translate3d(2%, 2%, 0) scale(1.0);`
2. Apply `animation: meshpan-gpu 20s ease-in-out infinite alternate` to `body::before`.
3. Add `will-change: transform` to `body::before`.
</action>
<acceptance_criteria>
- `@keyframes meshpan-gpu` exists with `translate3d`.
- `body::before` uses `animation: meshpan-gpu`.
</acceptance_criteria>
</task>

<task>
<id>08-01-03</id>
<title>Hardware Acceleration for UI Modals</title>
<read_first>
- ui/styles.css
</read_first>
<action>
1. Add `will-change: transform, opacity` to `.about-panel` and `#theme-hud`.
2. Ensure `.about-panel` entry transition uses `translate3d(0, 20px, 0)` in its hidden state and `translate3d(0, 0, 0)` in its `.open` state.
3. Add `backface-visibility: hidden` to `.drop-zone` and `.about-panel` to prevent font artifacts during transforms.
</action>
<acceptance_criteria>
- `.about-panel` selector contains `will-change: transform, opacity`.
- `#theme-hud` contains `will-change: transform`.
</acceptance_criteria>
</task>

</wave>

## ✅ Verification Protocol

### Automated
- `npm test` (Ensure no logic regressions).
- Grep check for `background-position` animations in `ui/styles.css` (should be 0).

### Manual (UAT)
- **UAT-8.1:** Enable "Paint Flashing" in DevTools. Background should NOT flash during movement.
- **UAT-8.2:** Verify 60fps background movement on mobile emulation.
- **UAT-8.3:** Verify Slate/Sage themes correctly disable the animated mesh.
