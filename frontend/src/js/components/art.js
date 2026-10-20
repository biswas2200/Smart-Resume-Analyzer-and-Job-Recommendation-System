// The comic's printed objects: Kite the paper hawk, a resume page (the reader's map) and the
// padlock on Premium chapters. They are drawn once per page as an SVG sprite and reused
// with <use href="#hawk">. Colours come from css/app.css, through class names on the symbols'
// own shapes (a selector can't reach through <use> from the page). This file holds static
// markup only; no user data ever goes into it.

const SPRITE = `
<svg id="art-sprite" width="0" height="0" style="position: absolute" aria-hidden="true" focusable="false">
  <defs>
    <pattern id="halftone" width="5" height="5" patternUnits="userSpaceOnUse">
      <rect class="ht-bg" width="5" height="5"></rect>
      <circle class="ht-dot" cx="2.5" cy="2.5" r="1.1"></circle>
    </pattern>
    <symbol id="hawk" viewBox="0 0 120 80">
      <polygon class="hk-shade" points="54,46 72,12 40,47"></polygon>
      <polygon class="hk-paper" points="14,52 0,40 4,64"></polygon>
      <polygon class="hk-paper" points="12,53 58,38 92,42 58,59"></polygon>
      <line class="hk-crease" x1="58" y1="38" x2="58" y2="59"></line>
      <polygon class="hk-dots" points="46,50 80,6 34,53"></polygon>
      <polygon class="hk-paper" points="56,46 80,6 46,50"></polygon>
      <polygon class="hk-paper" points="88,35 114,44 88,53"></polygon>
      <polygon class="hk-beak" points="107,41.5 119,44.5 107,47.5"></polygon>
      <circle class="hk-eye" cx="96" cy="42" r="2.6"></circle>
    </symbol>
    <symbol id="page" viewBox="0 0 60 76">
      <path class="pg-paper" d="M4 4 H42 L56 18 V72 H4 Z"></path>
      <path class="pg-fold" d="M42 4 V18 H56 Z"></path>
      <path class="pg-line pg-mark" d="M13 30 H34"></path>
      <path class="pg-line" d="M13 41 H47 M13 51 H47 M13 61 H39"></path>
    </symbol>
    <symbol id="padlock" viewBox="0 0 70 80">
      <path class="lock-shackle" d="M18 36 V24 a17 17 0 0 1 34 0 V36"></path>
      <rect class="lock-body" x="6" y="34" width="58" height="42" rx="6"></rect>
      <circle class="lock-hole" cx="35" cy="52" r="6"></circle>
    </symbol>
  </defs>
</svg>`;

/** Kite drawn in full rather than from the sprite, so the gutter can flap its wing. */
export const KITE_SVG = `
<svg class="hawk-svg" viewBox="0 0 120 80" aria-hidden="true" focusable="false">
  <polygon class="hk-shade" points="54,46 72,12 40,47"></polygon>
  <polygon class="hk-paper" points="14,52 0,40 4,64"></polygon>
  <polygon class="hk-paper" points="12,53 58,38 92,42 58,59"></polygon>
  <line class="hk-crease" x1="58" y1="38" x2="58" y2="59"></line>
  <g class="wing">
    <polygon class="hk-dots" points="46,50 80,6 34,53"></polygon>
    <polygon class="hk-paper" points="56,46 80,6 46,50"></polygon>
  </g>
  <polygon class="hk-paper" points="88,35 114,44 88,53"></polygon>
  <polygon class="hk-beak" points="107,41.5 119,44.5 107,47.5"></polygon>
  <circle class="hk-eye" cx="96" cy="42" r="2.6"></circle>
</svg>`;

/** Adds the sprite to the page. Safe to call more than once; the first call wins. */
export function installArt() {
  if (!document.getElementById('art-sprite')) {
    document.body.insertAdjacentHTML('afterbegin', SPRITE);
  }
}

/** A decorative `<svg>` showing one sprite symbol: `useArt('page', 'big-page')`. */
export function useArt(symbol, className) {
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(svgNs, 'use');
  use.setAttribute('href', `#${symbol}`);
  svg.append(use);
  return svg;
}
