import test from 'node:test';
import assert from 'node:assert/strict';
import { showAppointmentModal, hideAppointmentModal } from '../public/js/appointment-modal.js';

function createMockElement(id) {
  const classSet = new Set();
  const element = {
    id,
    style: {},
    attributes: {},
    className: '',
    parentNode: null,
    classList: {
      add(...names) {
        names.forEach((name) => {
          classSet.add(name);
        });
        element.className = Array.from(classSet).join(' ');
      },
      remove(...names) {
        names.forEach((name) => {
          classSet.delete(name);
        });
        element.className = Array.from(classSet).join(' ');
      },
      contains(name) {
        return classSet.has(name);
      }
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    removeAttribute(name) {
      delete this.attributes[name];
    },
    getAttribute(name) {
      return this.attributes[name];
    }
  };

  return element;
}

test('showAppointmentModal falls back to manual DOM visibility when Bootstrap is unavailable', () => {
  const modalEl = createMockElement('appointmentFormModal');
  const backdropEl = createMockElement('backdrop');
  const appended = [];
  const body = {
    classList: {
      add: () => {},
      remove: () => {}
    },
    appendChild(child) {
      child.parentNode = this;
      appended.push(child);
    }
  };

  globalThis.window = globalThis;
  globalThis.document = {
    body,
    createElement: () => backdropEl,
    querySelector: () => (appended[0] && appended[0].className.includes('modal-backdrop') ? appended[0] : null),
    getElementById: () => modalEl
  };

  const result = showAppointmentModal(modalEl, null);

  assert.equal(result, false);
  assert.equal(modalEl.style.display, 'block');
  assert.equal(modalEl.classList.contains('show'), true);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].className.includes('modal-backdrop'), true);
});

test('hideAppointmentModal removes the modal-open state and backdrop when present', () => {
  const modalEl = createMockElement('appointmentFormModal');
  const backdropEl = createMockElement('backdrop');
  const removed = [];
  const body = {
    classList: {
      add: () => {},
      remove: () => {}
    },
    appendChild(child) {
      child.parentNode = this;
    },
    removeChild(child) {
      removed.push(child);
      child.parentNode = null;
    }
  };

  globalThis.window = globalThis;
  globalThis.document = {
    body,
    createElement: () => backdropEl,
    querySelector: () => backdropEl,
    getElementById: () => modalEl
  };

  hideAppointmentModal(modalEl, null);

  assert.equal(removed.length, 0);
});
