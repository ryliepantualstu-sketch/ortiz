// Dashboard utilities
function loadUserInfo() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (!user) {
        window.location.href = '/public/index.html';
    }
    return user;
}

function logout() {
    confirmLogout('/public/index.html');
}

// Load dashboard data based on role
async function loadDashboard() {
    const user = loadUserInfo();
    
    switch(user.role) {
        case 'admin':
            loadAdminDashboard();
            break;
        case 'customer':
            loadCustomerDashboard();
            break;
        case 'staff':
            loadStaffDashboard();
            break;
    }
}

async function loadAdminDashboard() {
    const result = await apiCall('/admin/dashboard-stats');
    if (result.success) {
        console.log('Admin stats:', result.stats);
        // Update dashboard with stats
    }
}

async function loadCustomerDashboard() {
    const result = await apiCall('/customer/dashboard-stats');
    if (result.success) {
        console.log('Customer stats:', result.stats);
        // Update dashboard with stats
    }
}

async function loadStaffDashboard() {
    const result = await apiCall('/staff/dashboard-stats');
    if (result.success) {
        console.log('Staff stats:', result.stats);
        // Update dashboard with stats
    }
}

window.addEventListener('DOMContentLoaded', loadDashboard);
