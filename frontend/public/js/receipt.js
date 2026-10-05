(function () {
  const SHOP_NAME = 'ORTIZ OPTICAL';
  const WIDTH_CSS = 'width: 320px; max-width: 100%;';
  const LENS_LABELS = {
    'frame-only': 'Frame Only',
    'regular-lens': 'Regular Lens',
    'photochromic': 'Photochromic'
  };

  const esc = (value) => {
    const el = document.createElement('div');
    el.textContent = value == null ? '' : String(value);
    return el.innerHTML;
  };
  const peso = (value) => `₱${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const row = (left, right, extra = '') => `<div class="rc-row ${extra}"><span>${left}</span><span>${right}</span></div>`;
  const line = '<div class="rc-line"></div>';

  function formatDateTime(value) {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return 'N/A';
    return d.toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  }

  function buildReceiptHtml(order) {
    const user = order.Customer?.User || {};
    const items = order.OrderItems || order.items || [];
    const total = Number(order.total_amount || 0);
    const discount = Number(order.discount_amount || 0);
    const grossBeforeDiscount = total + discount;
    // Prices are VAT inclusive (12%)
    const vatableSales = total / 1.12;
    const vatAmount = total - vatableSales;
    const discountLabel = order.discount_type
      ? ({ senior: 'Senior Citizen', pwd: 'PWD' }[String(order.discount_type).toLowerCase()] || order.discount_type)
      : null;

    const itemRows = items.map((item) => {
      const name = item.Product?.product_name || item.product_name || 'Item';
      const lens = LENS_LABELS[item.lens_option] || 'Regular Lens';
      return `
        ${row(`${item.quantity || 1} pc(s) x ${esc(name)}`, peso(item.subtotal))}
        <div class="rc-sub">${esc(lens)} / ${peso(item.price)} each</div>`;
    }).join('');

    return `
      <div class="rc-center rc-title">${SHOP_NAME}</div>
      <div class="rc-center">Official Receipt</div>
      ${line}
      ${row('Receipt No.', `OR-${String(order.order_id).padStart(6, '0')}`)}
      ${row('Order #', order.order_id)}
      ${row('Date', formatDateTime(order.order_date || order.created_at))}
      ${row('Status', esc(String(order.status || 'pending').toUpperCase()))}
      ${line}
      <div class="rc-bold">CUSTOMER INFORMATION</div>
      <div class="rc-sub">Name: ${esc(user.full_name || 'N/A')}</div>
      <div class="rc-sub">Email: ${esc(user.email || 'N/A')}</div>
      <div class="rc-sub">Phone: ${esc(user.phone || order.Customer?.phone || 'N/A')}</div>
      <div class="rc-sub">Address: ${esc(order.delivery_address || order.Customer?.address || 'N/A')}</div>
      <div class="rc-sub">Type: ${esc(discountLabel || 'Regular')}</div>
      ${line}
      ${row('Order Type', 'In-clinic pickup')}
      ${order.pickup_date ? row('Pickup Date', esc(order.pickup_date)) : ''}
      ${line}
      ${itemRows}
      ${line}
      ${discount > 0 ? row('Subtotal', peso(grossBeforeDiscount)) + row(`${esc(discountLabel || 'Discount')} Discount`, `-${peso(discount)}`) : ''}
      ${row('Total', peso(total), 'rc-bold rc-big')}
      ${line}
      ${row('Total Sales (VAT Inclusive)', peso(total))}
      ${row('Less: VAT', peso(vatAmount))}
      ${row('Amount Net of VAT', peso(vatableSales))}
      ${row('VATable Sales', peso(vatableSales))}
      ${row('VAT Amount (12%)', peso(vatAmount))}
      ${line}
      <div class="rc-center rc-bold" style="margin: 10px 0;">Thank you for your order!</div>
      ${line}
      <div class="rc-center" style="margin-top: 28px;">______________________________</div>
      <div class="rc-center">Cashier / Authorized<br>Representative</div>`;
  }

  const STYLE = `
    .rc-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 3000; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .rc-card { background: #fff; border-radius: 14px; width: 420px; max-width: 100%; max-height: 92vh; display: flex; flex-direction: column; padding: 16px; }
    .rc-paper { overflow-y: auto; padding: 14px 16px; font-family: 'Courier New', monospace; font-size: 12px; color: #111; line-height: 1.5; flex: 1; border: 1px solid #e5e7eb; border-radius: 8px; }
    .rc-row { display: flex; justify-content: space-between; gap: 10px; }
    .rc-row span:last-child { text-align: right; white-space: nowrap; }
    .rc-line { border-top: 1px dashed #111; margin: 6px 0; }
    .rc-center { text-align: center; }
    .rc-title { font-size: 16px; font-weight: 700; letter-spacing: 1px; }
    .rc-bold { font-weight: 700; }
    .rc-big { font-size: 14px; }
    .rc-sub { color: #444; font-size: 11px; }
    .rc-btn { border: 0; border-radius: 8px; padding: 12px; font-weight: 700; color: #fff; width: 100%; margin-top: 10px; cursor: pointer; }
  `;

  function closeReceipt() {
    document.getElementById('orderReceiptOverlay')?.remove();
  }

  function printReceipt() {
    const paper = document.getElementById('orderReceiptPaper');
    if (!paper) return;
    const win = window.open('', '_blank', 'width=420,height=700');
    if (!win) {
      alert('Please allow pop-ups to print the receipt.');
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Receipt</title><style>${STYLE}
      body { margin: 0; } .rc-paper { ${WIDTH_CSS} border: 0; margin: 0 auto; overflow: visible; }</style></head>
      <body><div class="rc-paper">${paper.innerHTML}</div></body></html>`);
    win.document.close();
    win.focus();
    win.onload = () => { win.print(); };
    setTimeout(() => { try { win.print(); } catch (e) { /* already printed */ } }, 500);
  }

  window.showOrderReceipt = function (order) {
    if (!order) {
      alert('Order not loaded yet.');
      return;
    }
    closeReceipt();
    const overlay = document.createElement('div');
    overlay.id = 'orderReceiptOverlay';
    overlay.className = 'rc-overlay';
    overlay.innerHTML = `
      <style>${STYLE}</style>
      <div class="rc-card" role="dialog" aria-label="Order receipt">
        <div class="rc-paper" id="orderReceiptPaper">${buildReceiptHtml(order)}</div>
        <button type="button" class="rc-btn" style="background:#16a34a" id="receiptPrintBtn">Print Receipt</button>
        <button type="button" class="rc-btn" style="background:#1e3a8a" id="receiptDoneBtn">Done</button>
      </div>`;
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeReceipt(); });
    document.body.appendChild(overlay);
    document.getElementById('receiptPrintBtn').addEventListener('click', printReceipt);
    document.getElementById('receiptDoneBtn').addEventListener('click', closeReceipt);
  };
})();
