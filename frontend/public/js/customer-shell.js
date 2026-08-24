const CUSTOMER_SHELL_LINKS = [
  { href: 'customer-dashboard.html#dashboard', icon: 'fas fa-chart-pie', label: 'Dashboard' },
  { href: 'customer-dashboard.html#products', icon: 'fas fa-bag-shopping', label: 'Shop' },
  { href: 'customer-dashboard.html#cart', icon: 'fas fa-cart-shopping', label: 'Cart' },
  { href: 'customer-dashboard.html#appointments', icon: 'fas fa-calendar-check', label: 'Appointments' },
  { href: 'customer-dashboard.html#orders', icon: 'fas fa-receipt', label: 'Orders' }
];

const CUSTOMER_SHELL_SHARED_SCRIPTS = [
  'customer-shell.js',
  'api.js',
  'auth.js',
  'bootstrap.bundle.min.js',
  'disable-transitions.js'
];

function getCurrentCustomerPage() {
  const path = window.location.pathname;
  const page = path.substring(path.lastIndexOf('/') + 1) || 'customer-dashboard.html';
  return page.toLowerCase();
}

function getCustomerSidebarMarkup() {
  return `
    <div class="sidebar-overlay" id="sidebarOverlay" onclick="toggleSidebar()"></div>
    <aside class="sidebar" id="sidebar" aria-label="Customer navigation">
      <div class="sidebar-header">
        <div class="sidebar-user">
          <div class="sidebar-user-avatar" id="userInitial">C</div>
          <div class="sidebar-user-info">
            <h6 id="sidebarUserName">Customer</h6>
            <p>Customer account</p>
          </div>
        </div>
      </div>

      <ul class="nav-list">
        ${CUSTOMER_SHELL_LINKS.map(link => `
          <li>
            <a class="nav-link" href="${link.href}" aria-label="${link.label}">
              <i class="${link.icon}"></i>
              <span>${link.label}</span>
            </a>
          </li>
        `).join('')}
      </ul>

      <div class="sidebar-footer">
        <button class="logout-btn btn btn-sm btn-outline-light" onclick="logout()">
          <i class="fas fa-sign-out-alt"></i>
          <span>Logout</span>
        </button>
      </div>
    </aside>
  `;
}

let customerSidebarInitialized = false;

function renderCustomerSidebar() {
  let container = document.getElementById('customerSidebarContainer');
  if (!container) {
    const wrapper = document.querySelector('.shell-wrapper');
    if (!wrapper) return;
    container = document.createElement('div');
    container.id = 'customerSidebarContainer';
    wrapper.insertBefore(container, wrapper.firstChild);
  }

  container.innerHTML = getCustomerSidebarMarkup();
  setActiveCustomerNavLink();
}

function applyCustomerSidebarState() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar && window.innerWidth <= 992) {
    sidebar.classList.remove('show');
  }
  setActiveCustomerNavLink();
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');
  if (!sidebar || !overlay) return;

  const isOpen = sidebar.classList.toggle('show');
  overlay.classList.toggle('show', isOpen);
}

function setActiveCustomerNavLink() {
  const currentPage = getCurrentCustomerPage();
  document.querySelectorAll('.sidebar .nav-link').forEach((link) => {
    const isActive = link.getAttribute('href') === currentPage;
    link.classList.toggle('active', isActive);
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function isCustomerPageUrl(url) {
  if (!(url instanceof URL)) {
    url = new URL(url, window.location.href);
  }
  if (url.origin !== window.location.origin) return false;
  const page = url.pathname.substring(url.pathname.lastIndexOf('/') + 1);
  return CUSTOMER_SHELL_LINKS.some((link) => link.href === page);
}

function customerNavigate(href) {
  const routeUrl = new URL(href, window.location.href);
  window.location.href = routeUrl.href;
}

function initCustomerRouter() {
  // Client-side routing is disabled for stability.
  window.customerNavigate = customerNavigate;
}

function initCustomerSidebar() {
  if (customerSidebarInitialized) return;

  renderCustomerSidebar();
  document.body.classList.add('customer-professional');
  applyCustomerSidebarState();
  initCustomerRouter();
  window.addEventListener('resize', applyCustomerSidebarState);

  document.addEventListener('click', (event) => {
    const navLink = event.target.closest('.sidebar .nav-link');
    const overlay = event.target.closest('.sidebar-overlay');

    if (overlay) {
      toggleSidebar();
    }

    if (navLink && window.innerWidth <= 992) {
      toggleSidebar();
    }
  }, true);

  customerSidebarInitialized = true;
}

function ensureCustomerSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar || !customerSidebarInitialized) {
    initCustomerSidebar();
  } else {
    setActiveCustomerNavLink();
    applyCustomerSidebarState();
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', initCustomerSidebar);
} else {
  initCustomerSidebar();
}
window.addEventListener('pageshow', ensureCustomerSidebar);
