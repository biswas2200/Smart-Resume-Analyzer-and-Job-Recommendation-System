import { getParsedProfile, listVersions, upload } from '../api/resume-api.js';
import { extractApiErrorMessage } from '../core/api-error.js';
import { byId, hide, renderSkillChips, setBusy, setText, show } from '../core/dom.js';
import { requireAuth } from '../core/session.js';
import { validateResumeFile } from '../core/validation.js';
import { renderHeader } from '../components/header.js';

// Resume upload page: pick a PDF/DOCX, upload it as a new version (FR-1.5), then show the
// profile extracted from it plus the user's full upload history.

if (requireAuth()) {
  renderHeader();
  init();
}

function init() {
  const fileInput = byId('resume-file');
  const submitButton = byId('upload-submit');
  const errorBanner = byId('upload-error');
  const note = byId('upload-note');

  let versions = [];
  loadHistory();

  fileInput.addEventListener('change', () => hide(errorBanner));

  submitButton.addEventListener('click', async () => {
    const file = fileInput.files[0] ?? null;
    const validationError = validateResumeFile(file);
    if (validationError) {
      showError(validationError);
      return;
    }

    hide(errorBanner);
    setBusy(submitButton, true, 'Uploading…');
    show(note);

    try {
      const resume = await upload(file);
      versions = [...versions, resume];
      renderHistory(versions);
      renderProfile(await getParsedProfile(resume.id));
      fileInput.value = '';
    } catch (error) {
      // The backend's message is specific where it matters -- an unsupported file format (415)
      // or the AI engine being unavailable for a Premium analysis (503) -- so prefer it.
      showError(extractApiErrorMessage(error, 'Could not upload the resume. Please try again.'));
    } finally {
      setBusy(submitButton, false);
      hide(note);
    }
  });

  async function loadHistory() {
    try {
      versions = await listVersions();
      renderHistory(versions);
    } catch (error) {
      console.error('Could not load upload history', error);
    }
  }

  function showError(message) {
    setText(errorBanner, message);
    show(errorBanner);
  }
}

function renderHistory(versions) {
  const list = byId('history-list');
  show(byId('history-empty'), versions.length === 0);
  show(list, versions.length > 0);
  list.replaceChildren(
    ...versions.map((resume) => {
      const item = document.createElement('li');
      item.className = 'list-group-item px-0';
      item.textContent = `Version ${resume.version} — uploaded ${formatDateTime(resume.uploadedAt)}`;
      return item;
    }),
  );
}

function renderProfile(profile) {
  setText(byId('profile-name'), profile.name);
  setText(byId('profile-email'), profile.email);
  renderSkillChips(byId('profile-skills'), profile.skills, 'neutral');

  renderEntries(
    'profile-experience',
    profile.experience,
    (entry) => `${entry.title} — ${entry.organization} (${entry.duration})`,
  );
  renderEntries(
    'profile-education',
    profile.education,
    (entry) => `${entry.degree} — ${entry.institution} (${entry.year})`,
  );

  show(byId('profile-card'));
}

function renderEntries(listId, entries, describe) {
  show(byId(`${listId}-section`), entries.length > 0);
  byId(listId).replaceChildren(
    ...entries.map((entry) => {
      const item = document.createElement('li');
      item.textContent = describe(entry);
      return item;
    }),
  );
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}
