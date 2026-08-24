const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const PAGES_DIR = path.resolve(__dirname, '../../frontend/public/pages');

test('frontend pages directory contains only the consolidated dashboard files', () => {
    const files = fs.readdirSync(PAGES_DIR);
    assert.deepEqual(files.sort(), [
        'admin-dashboard.html',
        'customer-dashboard.html',
        'staff-dashboard.html'
    ].sort());
});

test('customer-dashboard.html contains all 5 unified portal sections', () => {
    const dashboardHtml = fs.readFileSync(path.join(PAGES_DIR, 'customer-dashboard.html'), 'utf8');

    assert.ok(dashboardHtml.includes('id="dashboardSection"'), 'dashboardSection should exist');
    assert.ok(dashboardHtml.includes('id="productsSection"'), 'productsSection should exist');
    assert.ok(dashboardHtml.includes('id="cartSection"'), 'cartSection should exist');
    assert.ok(dashboardHtml.includes('id="appointmentsSection"'), 'appointmentsSection should exist');
    assert.ok(dashboardHtml.includes('id="ordersSection"'), 'ordersSection should exist');
});

test('customer-dashboard.html contains all required modal dialogs', () => {
    const dashboardHtml = fs.readFileSync(path.join(PAGES_DIR, 'customer-dashboard.html'), 'utf8');

    assert.ok(dashboardHtml.includes('id="profileModal"'), 'profileModal should exist');
    assert.ok(dashboardHtml.includes('id="productPreviewModal"'), 'productPreviewModal should exist');
    assert.ok(dashboardHtml.includes('id="checkoutModal"'), 'checkoutModal should exist');
    assert.ok(dashboardHtml.includes('id="appointmentFormModal"'), 'appointmentFormModal should exist');
    assert.ok(dashboardHtml.includes('id="appointmentQrModal"'), 'appointmentQrModal should exist');
    assert.ok(dashboardHtml.includes('id="customerOrderDetailModal"'), 'customerOrderDetailModal should exist');
});

test('customer-dashboard.html includes section router and hash routing', () => {
    const dashboardHtml = fs.readFileSync(path.join(PAGES_DIR, 'customer-dashboard.html'), 'utf8');

    assert.ok(dashboardHtml.includes('function loadSection('), 'loadSection router function should exist');
    assert.ok(dashboardHtml.includes('hashchange'), 'hashchange event listener should exist');
});
