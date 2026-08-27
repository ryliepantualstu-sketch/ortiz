// Auth utilities - Form logic is now in index.html
// This file is kept for any global auth functions

// Logout confirmation helper using Bootstrap modal
function confirmLogout(redirectUrl = '../index.html') {
    if (!window.bootstrap || !bootstrap.Modal) {
        const shouldLogout = window.confirm('Are you sure you want to log out?');
        if (!shouldLogout) {
            return;
        }
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = redirectUrl;
        return;
    }

    let modalEl = document.getElementById('logoutConfirmModal');
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = 'logoutConfirmModal';
        modalEl.innerHTML = `
            <div class="modal fade" tabindex="-1" aria-labelledby="logoutConfirmModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title" id="logoutConfirmModalLabel">Confirm Logout</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body text-center">
                            <div class="logout-icon mx-auto mb-3">
                                <i class="fas fa-sign-out-alt fa-lg" style="color: #e02f4f;"></i>
                            </div>
                            <p class="logout-confirm-text fw-semibold">Are you sure you want to log out?</p>
                            <p class="small-text mb-0">You will need to sign in again to continue managing appointments, orders, and customer records.</p>
                        </div>
                        <div class="modal-footer justify-content-center">
                            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                            <button type="button" class="btn btn-danger" id="logoutConfirmButton">Logout</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
        const modalNode = modalEl.querySelector('.modal');
        modalNode.id = 'logoutConfirmModal';
        modalNode.style.zIndex = '2147483647';
        modalNode.style.pointerEvents = 'auto';
        modalNode.querySelector('.modal-content').style.pointerEvents = 'auto';
        modalEl.replaceWith(modalNode);
        modalEl = modalNode;

        const confirmButton = modalEl.querySelector('#logoutConfirmButton');
        confirmButton.addEventListener('click', () => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            const bsModal = bootstrap.Modal.getInstance(modalEl);
            if (bsModal) {
                bsModal.hide();
            }
            const targetUrl = confirmButton.dataset.redirectUrl || redirectUrl;
            window.location.href = targetUrl;
        });
    }

    const confirmButton = modalEl.querySelector('#logoutConfirmButton');
    confirmButton.dataset.redirectUrl = redirectUrl;

    const modalDialog = bootstrap.Modal.getOrCreateInstance(modalEl, {
        backdrop: 'static',
        keyboard: false
    });
    modalDialog.show();
}

// Logout function (used in dashboards)
function logout() {
    confirmLogout('../index.html');
}

// Check if user is authenticated
function isAuthenticated() {
    return !!localStorage.getItem('token') && !!localStorage.getItem('user');
}

// Get current user
function getCurrentUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
}

// Check if user has specific role
function hasRole(role) {
    const user = getCurrentUser();
    return user && user.role === role;
}

// Render profile-related UI elements (defensive: does not redirect)
function renderProfileElements() {
    try {
        const user = getCurrentUser();
        if (!user) {
            // Not logged in — leave UI alone but warn during debugging
            console.warn('renderProfileElements: no user in localStorage');
            return;
        }

        const displayName = user.full_name || user.name || user.email || 'User';
        const userNameEl = document.getElementById('userName');
        const sidebarUserNameEl = document.getElementById('sidebarUserName');
        const userInitialEl = document.getElementById('userInitial');

        if (!userNameEl) console.debug('renderProfileElements: userName element not found');
        if (!sidebarUserNameEl) console.debug('renderProfileElements: sidebarUserName element not found');
        if (!userInitialEl) console.debug('renderProfileElements: userInitial element not found');

        if (userNameEl) userNameEl.textContent = displayName;
        if (sidebarUserNameEl) sidebarUserNameEl.textContent = displayName;
        if (userInitialEl) userInitialEl.textContent = displayName.charAt(0).toUpperCase();
        document.body.classList.add('profile-ready');
    } catch (err) {
        console.error('renderProfileElements error:', err);
    }
}

// Re-render profile when navigating within the app or when page is restored from bfcache
window.addEventListener('pageshow', (e) => {
    renderProfileElements();
    if (e.persisted) {
        applySavedSidebarState();
    }
});

const SIDEBAR_STATE_STORAGE_KEY = 'sidebar-open-state';

function saveSidebarState(isOpen) {
    try {
        localStorage.setItem(SIDEBAR_STATE_STORAGE_KEY, isOpen ? '1' : '0');
    } catch (err) {
        console.warn('Unable to save sidebar state', err);
    }
}

function getSavedSidebarState() {
    return localStorage.getItem(SIDEBAR_STATE_STORAGE_KEY) === '1';
}

function applySavedSidebarState() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (!sidebar) return;

    const isOpen = getSavedSidebarState();
    if (window.innerWidth <= 768) {
        sidebar.classList.toggle('show', isOpen);
        if (overlay) overlay.classList.toggle('show', isOpen);
    } else {
        sidebar.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
    }
}

function initSidebarPersistence() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    if (!sidebar) return;

    applySavedSidebarState();

    document.addEventListener('click', (ev) => {
        const toggle = ev.target.closest && ev.target.closest('.mobile-menu-btn');
        const clickedOverlay = ev.target.closest && ev.target.closest('.sidebar-overlay');
        const clickedNavLink = ev.target.closest && ev.target.closest('.sidebar .nav-link');

        if (toggle) {
            setTimeout(() => {
                saveSidebarState(sidebar.classList.contains('show'));
            }, 80);
        }

        if (clickedOverlay) {
            saveSidebarState(false);
        }

        if (clickedNavLink && window.innerWidth <= 768) {
            saveSidebarState(false);
        }
    }, true);
}

window.addEventListener('DOMContentLoaded', () => {
    renderProfileElements();
    initSidebarPersistence();
});
