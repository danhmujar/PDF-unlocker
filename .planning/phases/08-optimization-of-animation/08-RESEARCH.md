# 🔬 Phase 8 Research: Animation Optimization

## 📊 Overview
Phase 8 focuses on hardening the UI's visual performance, specifically targeting the high-impact "Aurora" mesh gradient and the glassmorphic modal effects. Currently, these rely on `background-position` animations and heavy `backdrop-filter` rules, which can lead to frame drops (jank) on mobile devices or high-DPI monitors.

## 🏗️ Architecture Patterns
### 1. The "Isolated Backplane" Pattern
Instead of animating the `body` or `main` container directly, promote the background to an isolated pseudo-element (`body::before`).
- **Benefit:** Decouples background movement from content rendering.
- **Benefit:** Allows the browser to optimize the background layer independently.

### 2. Composite-Only Animations
Transition from "paint-heavy" properties to "composite-only" properties.
- **Current:** `background-position` (Triggers Repaint)
- **Target:** `transform: translate3d()` and `scale()` (GPU Accelerated)

## 🛠️ Standard Stack
- **CSS GPU Offloading:** Utilizing `will-change: transform` to hint at layer promotion.
- **Hardware Acceleration:** Native `translate3d` for sub-pixel smoothness.
- **View Transitions API:** Leveraging the built-in browser API for layout shifts (already used in `renderBentoGrid`).

## 🚫 Don't Hand-Roll
- **Do NOT** use `requestAnimationFrame` for the mesh gradient. CSS animations are more power-efficient as the browser can pause them when the tab is hidden.
- **Do NOT** create custom blur shaders unless absolutely necessary (existing `backdrop-filter` is optimized at the OS level on many devices).

## ⚠️ Common Pitfalls
- **Layer Explosion:** Overusing `will-change` can crash the GPU process on mobile devices due to memory exhaustion. Limit promotion to the background and active modals.
- **Blur vs. Performance:** Large `backdrop-filter: blur(20px)` on 100% width/height containers can drop FPS to <30. Target smaller elements or use pre-rendered blur assets for static overlays.
- **Sub-pixel Text:** 3D transforms can sometimes blur text. Use `backface-visibility: hidden` and `transform: translate3d(0,0,0)` carefully on parent containers.

## 💻 Code Examples

### 1. Optimized Mesh Gradient (Pseudo-element approach)
```css
body::before {
    content: '';
    position: fixed;
    top: -50%;
    left: -50%;
    width: 200%;
    height: 200%;
    z-index: -1;
    background-image: 
        radial-gradient(at 40% 20%, var(--mesh-1) 0px, transparent 50%),
        /* ... other gradients ... */;
    background-size: 100% 100%;
    animation: meshpan-optimized 20s ease-in-out infinite alternate;
    will-change: transform;
}

@keyframes meshpan-optimized {
    0% { transform: translate3d(5%, 5%, 0) scale(1); }
    50% { transform: translate3d(-5%, 0, 0) scale(1.1); }
    100% { transform: translate3d(0, -5%, 0) scale(1); }
}
```

### 2. Performance-Aware Modal (Hardware Accel)
```css
.about-panel {
    /* Use transform for entry instead of just scale to keep it on the compositor */
    transform: translate3d(0, 20px, 0) scale(0.95);
    will-change: transform, opacity;
}

.modal-backdrop.open .about-panel {
    transform: translate3d(0, 0, 0) scale(1);
}
```

## 📈 Quality Gate
- [x] All domains investigated (Background, Modals, Card Transitions)
- [x] Negative claims verified (CSS vs JS performance)
- [x] Sources verified (MDN, Web.dev, Chrome DevTools Best Practices)
- [x] Section names match plan-phase expectations
