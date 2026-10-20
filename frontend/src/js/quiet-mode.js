// Loaded from <head> as a classic script, not a module, so it runs before the first paint.
// Quiet mode (Kite perches, the chapters read top to bottom, nothing animates) follows the
// reader's own choice from the gutter toggle; without one, it follows the system's
// reduced-motion setting. css/app.css styles html[data-motion="off"]; js/components/kite.js
// owns the toggle.
(() => {
  let quiet = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    const choice = localStorage.getItem('resumeAnalyser.motion');
    if (choice) {
      quiet = choice === 'off';
    }
  } catch {
    // Storage blocked: keep the system setting.
  }
  if (quiet) {
    document.documentElement.dataset.motion = 'off';
  }
})();
