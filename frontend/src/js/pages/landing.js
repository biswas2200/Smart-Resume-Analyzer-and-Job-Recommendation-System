import { byId, hide, show } from '../core/dom.js';
import { isAuthenticated } from '../core/session.js';
import { hydrateIcons } from '../components/icons.js';
import { getTierInfo } from '../api/tier-api.js';

// The public landing page: draws its icons, for a signed-in visitor swaps the sign-in
// buttons for a link straight to the dashboard, and in preview mode says Premium is free.

hydrateIcons();
if (isAuthenticated()) {
  hide(byId('signed-out-actions'));
  show(byId('signed-in-action'));
}
getTierInfo().then(
  (info) => {
    if (info?.previewMode === true) {
      show(byId('preview-note'));
    }
  },
  () => undefined,
);
