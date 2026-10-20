import { getParsedProfile, listVersions, upload } from '../api/resume-api.js';
import { extractApiErrorMessage } from '../core/api-error.js';
import { byId, cloneTemplate, field, hide, renderStickers, setBusy, setText, show } from '../core/dom.js';
import { requireAuth } from '../core/session.js';
import { validateResumeFile } from '../core/validation.js';
import { renderHeader } from '../components/header.js';
import { celebrate, renderGutter, restart, say } from '../components/kite.js';

// Chapter 2, The Map: upload a PDF/DOCX as a new resume version (FR-1.5), then show the profile
// read from it and every version uploaded so far. On load, the latest version's profile shows.

/** The version whose profile is on screen, so a slow load never replaces a newer upload. */
let shownVersion = -1;

if (requireAuth()) {
  renderHeader('map');
  renderGutter('Show me your map, traveller. Your resume tells me where you have been.');
  init();
}

function init() {
  const fileInput = byId('resume-file');
  const submitButton = byId('upload-submit');
  const errorBanner = byId('upload-error');
  const loader = byId('upload-loader');
  const dropzone = byId('dropzone');

  let versions = [];
  loadHistory();

  fileInput.addEventListener('change', () => {
    hide(errorBanner);
    showChosen(fileInput.files[0] ?? null);
  });

  // Dropping a file on the drop zone is the same as choosing it.
  for (const type of ['dragenter', 'dragover']) {
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      dropzone.classList.add('dragging');
    });
  }
  for (const type of ['dragleave', 'drop']) {
    dropzone.addEventListener(type, () => dropzone.classList.remove('dragging'));
  }
  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) {
      fileInput.files = event.dataTransfer.files;
      fileInput.dispatchEvent(new Event('change'));
    }
  });

  submitButton.addEventListener('click', async () => {
    const file = fileInput.files[0] ?? null;
    const validationError = validateResumeFile(file);
    if (validationError) {
      showError(validationError);
      return;
    }

    hide(errorBanner);
    setBusy(submitButton, true, 'Uploading…');
    show(loader);
    say('Reading your map. Hold tight, this takes a few seconds.');

    try {
      const resume = await upload(file);
      versions = [...versions, resume];
      renderHistory(versions);
      renderProfile(await getParsedProfile(resume.id), resume);
      restart(byId('profile-card'), 'flash');
      fileInput.value = '';
      showChosen(null);
      celebrate('GOT IT!');
      say('Got it! Your map is read. Turn to the Omens to see what it says.');
    } catch (error) {
      // The backend's message is specific where it matters -- an unsupported file format (415)
      // or the AI engine being unavailable for a Premium analysis (503) -- so prefer it.
      showError(extractApiErrorMessage(error, 'Could not upload the resume. Please try again.'));
      say("That one didn't fold right. The note above says why.");
    } finally {
      setBusy(submitButton, false);
      hide(loader);
    }
  });

  async function loadHistory() {
    try {
      versions = await listVersions();
      renderHistory(versions);
      const latest = versions.at(-1);
      if (!latest) {
        show(byId('profile-empty'));
        return;
      }
      renderProfile(await getParsedProfile(latest.id), latest);
      say('Here is your latest map. Upload a new version whenever your story changes.');
    } catch (error) {
      console.error('Could not load your maps', error);
    }
  }

  function showError(message) {
    setText(errorBanner, message);
    show(errorBanner);
  }
}

/** The dropzone names the chosen file, or invites one. */
function showChosen(file) {
  const text = byId('dropzone-text');
  const bold = document.createElement('b');
  if (file) {
    setText(bold, 'Chosen:');
    text.replaceChildren(bold, ` ${file.name} (${formatSize(file.size)})`);
  } else {
    setText(bold, 'Choose a resume');
    text.replaceChildren(bold, ' or drop it here');
  }
}

function renderHistory(versions) {
  const list = byId('history-list');
  show(byId('history-empty'), versions.length === 0);
  show(list, versions.length > 0);
  list.replaceChildren(
    ...versions.map((resume, index) => {
      const item = cloneTemplate('history-template');
      const latest = index === versions.length - 1;
      item.classList.toggle('latest', latest);
      item.title = `Uploaded ${formatDateTime(resume.uploadedAt)}`;
      setText(field(item, 'version'), `v${resume.version}`);
      setText(field(item, 'date'), latest ? `Latest · ${formatDate(resume.uploadedAt)}` : formatDate(resume.uploadedAt));
      return item;
    }),
  );
}

function renderProfile(profile, resume) {
  if (resume.version < shownVersion) {
    return;
  }
  shownVersion = resume.version;

  setText(byId('profile-version'), `Version ${resume.version}`);
  setText(byId('profile-name'), profile.name || 'Name not found');
  const contact = [profile.email, profile.phone].filter(Boolean).join(' · ');
  setText(byId('profile-contact'), contact);
  show(byId('profile-contact'), contact !== '');

  const skills = profile.skills ?? [];
  renderStickers(byId('profile-skills'), skills);
  show(byId('profile-skills-section'), skills.length > 0);

  renderTimeline('profile-experience', profile.experience ?? [], (entry) => [
    entry.title,
    entry.organization,
    entry.duration,
  ]);
  renderTimeline('profile-education', profile.education ?? [], (entry) => [
    entry.degree,
    entry.institution,
    entry.year,
  ]);

  hide(byId('profile-empty'));
  show(byId('profile-card'));
}

/** `describe(entry)` gives [what, where, when]; any of them may be missing from a resume. */
function renderTimeline(listId, entries, describe) {
  show(byId(`${listId}-section`), entries.length > 0);
  byId(listId).replaceChildren(
    ...entries.map((entry) => {
      const [what, where, when] = describe(entry);
      const item = cloneTemplate('timeline-template');
      setText(field(item, 'what'), what || where || '');
      setText(field(item, 'where'), what && where ? `, ${where}` : '');
      setText(field(item, 'when'), when);
      return item;
    }),
  );
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
