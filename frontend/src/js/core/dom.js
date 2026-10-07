// Small DOM helpers shared by the page scripts.
//
// Security rule for this app: anything that came from the backend (resume text, skills, the
// AI coaching narrative, error messages) goes into the page via `textContent` — never
// `innerHTML` — so a resume containing "<script>" is displayed, not executed.

/** `document.getElementById` that fails loudly if the HTML and the script disagree on an id. */
export function byId(id) {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`No element with id "${id}" on this page`);
  }
  return element;
}

export function show(element, visible = true) {
  element.hidden = !visible;
}

export function hide(element) {
  element.hidden = true;
}

export function setText(element, text) {
  element.textContent = text ?? '';
}

/**
 * Clones the first element inside a `<template id="...">` so list items can be built from
 * markup that lives in the HTML file, then filled in with {@link setText}.
 */
export function cloneTemplate(templateId) {
  return byId(templateId).content.firstElementChild.cloneNode(true);
}

/** Finds a child marked with `data-field="<name>"` inside a cloned template. */
export function field(root, name) {
  const element = root.querySelector(`[data-field="${name}"]`);
  if (!element) {
    throw new Error(`Template is missing data-field="${name}"`);
  }
  return element;
}

/**
 * Disables a button and swaps its label while a request is in flight (so it can't be
 * double-clicked), restoring the original label afterwards.
 */
export function setBusy(button, busy, busyLabel) {
  if (!button.dataset.idleLabel) {
    button.dataset.idleLabel = button.textContent;
  }
  button.disabled = busy;
  button.textContent = busy ? busyLabel : button.dataset.idleLabel;
}

/** Renders a row of skill chips (Bootstrap badges) into `container`, replacing what was there. */
export function renderSkillChips(container, skills, variant) {
  container.replaceChildren(
    ...skills.map((skill) => {
      const chip = document.createElement('span');
      chip.className = `badge rounded-pill skill-chip skill-chip--${variant}`;
      chip.textContent = skill;
      return chip;
    }),
  );
}

/**
 * Marks a form input invalid (Bootstrap `.is-invalid`) and writes the message into its
 * `.invalid-feedback` sibling; pass a null message to clear it.
 */
export function setFieldError(input, message) {
  const feedback = byId(`${input.id}-error`);
  input.classList.toggle('is-invalid', message !== null);
  if (message === null) {
    input.removeAttribute('aria-invalid');
  } else {
    input.setAttribute('aria-invalid', 'true');
  }
  setText(feedback, message);
}
