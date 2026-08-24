function ensureBackdrop() {
  const existingBackdrop = document.querySelector('.modal-backdrop');
  if (existingBackdrop) {
    if (existingBackdrop.style) {
      existingBackdrop.style.pointerEvents = 'none';
      existingBackdrop.style.filter = 'none';
      existingBackdrop.style.backdropFilter = 'none';
      existingBackdrop.style.zIndex = '2147483645';
    }
    return existingBackdrop;
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop fade show';
  if (backdrop.style) {
    backdrop.style.pointerEvents = 'none';
    backdrop.style.filter = 'none';
    backdrop.style.backdropFilter = 'none';
    backdrop.style.zIndex = '2147483645';
  }
  document.body.appendChild(backdrop);
  return backdrop;
}

function removeBackdrop() {
  const backdrop = document.querySelector('.modal-backdrop');
  if (backdrop && backdrop.parentNode) {
    backdrop.parentNode.removeChild(backdrop);
  }
}

function showAppointmentModal(modalEl, bootstrapInstance) {
  if (!modalEl) {
    return false;
  }

  if (modalEl.style) {
    modalEl.style.position = 'fixed';
    modalEl.style.zIndex = '2147483646';
    modalEl.style.pointerEvents = 'auto';
    modalEl.style.display = 'block';
    modalEl.style.inset = '0';
    modalEl.style.overflow = 'auto';
  }
  modalEl.classList.add('show');
  modalEl.setAttribute('aria-hidden', 'false');
  modalEl.setAttribute('aria-modal', 'true');

  if (bootstrapInstance && typeof bootstrapInstance.show === 'function') {
    document.body.classList.add('appointment-modal-open');
    bootstrapInstance.show();
    return true;
  }

  document.body.classList.add('appointment-modal-open');
  document.body.classList.add('modal-open');
  ensureBackdrop();
  return false;
}

function hideAppointmentModal(modalEl, bootstrapInstance) {
  if (!modalEl) {
    return false;
  }

  if (bootstrapInstance && typeof bootstrapInstance.hide === 'function') {
    bootstrapInstance.hide();
    return true;
  }

  modalEl.classList.remove('show');
  if (modalEl.style) {
    modalEl.style.display = 'none';
    modalEl.style.pointerEvents = 'none';
    modalEl.style.zIndex = '1';
  }
  modalEl.setAttribute('aria-hidden', 'true');
  modalEl.removeAttribute('aria-modal');
  document.body.classList.remove('appointment-modal-open');
  document.body.classList.remove('modal-open');
  removeBackdrop();
  return false;
}

const api = {
  showAppointmentModal,
  hideAppointmentModal,
  ensureAppointmentModalBackdrop: ensureBackdrop,
  removeAppointmentModalBackdrop: removeBackdrop
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}

const root = typeof globalThis !== 'undefined' ? globalThis : window;
root.showAppointmentModal = api.showAppointmentModal;
root.hideAppointmentModal = api.hideAppointmentModal;
root.ensureAppointmentModalBackdrop = api.ensureAppointmentModalBackdrop;
root.removeAppointmentModalBackdrop = api.removeAppointmentModalBackdrop;

if (typeof root !== 'undefined') {
  root.exportedAppointmentModal = api;
}

export { showAppointmentModal, hideAppointmentModal };
