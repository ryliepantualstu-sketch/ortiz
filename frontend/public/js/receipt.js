(function () {
  const SHOP = {
    name: 'KARIN ORTIZ OPTICAL CLINIC',
    address: 'Coronado St., Pob. 1, Nagcarlan, Laguna',
    owner: 'KARIN O. BERNARDINO',
    tin: '206-824-848-00000',
    printer: '20 Bklts. (50x2) 0001-1000',
    atp: '055AU20250000005143',
    dateIssued: '10/07/25'
  };
  const MIN_ROWS = 10;
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
  const peso = (value) => Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function formatDate(value) {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatDateTime(value) {
    return value.toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  }

  function buildReceiptHtml(order) {
    const user = order.Customer?.User || {};
    if (order.customer_name) user.full_name = order.customer_name;
    const items = order.OrderItems || order.items || [];
    const total = Number(order.total_amount || 0);
    const discount = Number(order.discount_amount || 0);
    const totalSales = total + discount;
    const discountLabel = order.discount_type
      ? ({ senior: 'SC', pwd: 'PWD' }[String(order.discount_type).toLowerCase()] || order.discount_type)
      : '';

    const rows = items.map((item) => {
      const name = item.Product?.product_name || item.product_name || 'Item';
      const lens = LENS_LABELS[item.lens_option] || 'Regular Lens';
      return `<tr>
        <td>${esc(name)} <span class="iv-small">(${esc(lens)})</span></td>
        <td class="iv-c">${item.quantity || 1}</td>
        <td class="iv-r">${peso(item.price)}</td>
        <td class="iv-r">${peso(item.subtotal)}</td>
      </tr>`;
    });
    while (rows.length < MIN_ROWS) rows.push('<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>');

    return `
      <div class="iv-head">
        <div>
          <div class="iv-shop">${SHOP.name}</div>
          <div class="iv-small">${SHOP.address}</div>
          <div class="iv-owner">${SHOP.owner} <span class="iv-small">- Prop.</span></div>
          <div class="iv-small">NON-VAT REG. TIN: ${SHOP.tin}</div>
        </div>
        <div class="iv-title"><div>SERVICE</div><div class="iv-title-big">INVOICE</div></div>
      </div>
      <div class="iv-meta">
        <div>
          <div><span class="iv-box"></span> CASH SALES</div>
          <div><span class="iv-box"></span> CHARGE SALES</div>
        </div>
        <div class="iv-right">
          <div class="iv-no">Nº <span>${String(order.order_id).padStart(4, '0')}</span></div>
          <div>Date: <span class="iv-fill">${esc(formatDate(order.order_date || order.created_at))}</span></div>
        </div>
      </div>
      <div class="iv-received">
        <div class="iv-bold">RECEIVED FROM:</div>
        <div class="iv-recv-body">
          <div>Registered Name: <span class="iv-fill">${esc(user.full_name || '')}</span></div>
          <div>TIN:</div>
          <div>Address: <span class="iv-fill">${esc(order.delivery_address || order.Customer?.address || '')}</span></div>
        </div>
      </div>
      <table class="iv-table">
        <thead><tr><th>Item Description/<br>Nature of Service</th><th>Quantity</th><th>Unit Price</th><th>AMOUNT</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
      <div class="iv-bottom">
        <div class="iv-left">
          <div class="iv-bold iv-small">SC/PWD/NAAC/MOV/Solo Parent</div>
          <div class="iv-small">ID No. <span class="iv-fill iv-wide"></span></div>
          <div class="iv-bold iv-small" style="margin-top:6px;">SC/PWD/NAAC/Solo Parent/MOV</div>
          <div class="iv-small iv-bold">Signature <span class="iv-fill iv-wide"></span></div>
        </div>
        <div class="iv-totals">
          <div class="iv-trow"><span>Total Sales</span><span>${peso(totalSales)}</span></div>
          <div class="iv-trow"><span>Less Discount: (SC/PWD/NAAC/MOV/SP)${discountLabel ? ` <b>${esc(discountLabel)}</b>` : ''}</span><span>${discount > 0 ? peso(discount) : ''}</span></div>
          <div class="iv-trow"><span>Less: Withholding Tax</span><span></span></div>
          <div class="iv-trow iv-bold"><span>TOTAL AMOUNT DUE</span><span>₱ ${peso(total)}</span></div>
        </div>
      </div>
      <div class="iv-foot">
        <div class="iv-small">
          ${SHOP.printer}<br>
          BIR Authority to Print No. <b>${SHOP.atp}</b><br>
          Date Issued: <b>${SHOP.dateIssued}</b>
        </div>
        <div class="iv-by">BY: <span class="iv-fill iv-wide"></span><div class="iv-small iv-c">Cashier/Authorized<br>Representative</div></div>
      </div>
      <div class="iv-c iv-small iv-bold" style="margin-top:8px;">"THIS DOCUMENT IS NOT VALID<br>FOR CLAIM OF INPUT TAXES"</div>
      <div class="iv-printed">PRINTED RECEIPT<div class="iv-small">Printed on: ${esc(formatDateTime(new Date()))}</div></div>`;
  }

  const STYLE = `
    .rc-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.6); z-index: 2147483000; display: flex; align-items: center; justify-content: center; padding: 16px; }
    .rc-card { background: #fff; border-radius: 14px; width: 520px; max-width: 100%; max-height: 94vh; display: flex; flex-direction: column; padding: 16px; }
    .rc-btn { border: 0; border-radius: 8px; padding: 12px; font-weight: 700; color: #fff; width: 100%; margin-top: 10px; cursor: pointer; }
    .iv-paper { overflow-y: auto; flex: 1; border: 1px solid #d1d5db; border-radius: 4px; padding: 14px; background: #fbfbf8; font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #111; }
    .iv-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .iv-shop { font-family: Georgia, 'Times New Roman', serif; font-weight: 900; font-size: 17px; letter-spacing: .5px; }
    .iv-owner { font-weight: 700; }
    .iv-small { font-size: 10.5px; }
    .iv-title { text-align: center; font-weight: 700; font-size: 11px; line-height: 1.1; }
    .iv-title-big { font-size: 17px; font-weight: 800; }
    .iv-meta { display: flex; justify-content: space-between; margin: 8px 0; }
    .iv-right { text-align: right; }
    .iv-no { color: #c0151b; font-family: Georgia, serif; font-weight: 700; font-size: 17px; }
    .iv-box { display: inline-block; width: 11px; height: 11px; border: 1.5px solid #111; margin-right: 4px; vertical-align: -1px; }
    .iv-fill { border-bottom: 1px solid #111; display: inline-block; min-width: 90px; padding: 0 4px; font-weight: 600; }
    .iv-wide { min-width: 120px; }
    .iv-received { border: 1.5px solid #111; margin-bottom: 8px; }
    .iv-received > .iv-bold { padding: 2px 6px; border-bottom: 1.5px solid #111; }
    .iv-recv-body { padding: 4px 6px; line-height: 1.9; }
    .iv-bold { font-weight: 700; }
    .iv-c { text-align: center; }
    .iv-r { text-align: right; }
    .iv-table { width: 100%; border-collapse: collapse; border: 1.5px solid #111; }
    .iv-table th, .iv-table td { border: 1px solid #111; padding: 2px 5px; height: 22px; }
    .iv-table th { font-weight: 600; text-align: center; font-size: 11px; }
    .iv-table th:nth-child(1) { width: 46%; }
    .iv-bottom { display: flex; border: 1.5px solid #111; border-top: 0; }
    .iv-left { width: 48%; padding: 4px 6px; border-right: 1.5px solid #111; }
    .iv-totals { flex: 1; }
    .iv-trow { display: flex; justify-content: space-between; gap: 6px; padding: 3px 6px; border-bottom: 1px solid #111; font-size: 11px; }
    .iv-trow:last-child { border-bottom: 0; }
    .iv-foot { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 8px; }
    .iv-printed { margin-top: 8px; padding: 4px; border: 2px solid #111; text-align: center; font-weight: 800; letter-spacing: 2px; }
    .iv-by { text-align: right; }
  `;

  function closeReceipt() {
    const overlay = document.getElementById('orderReceiptOverlay');
    if (overlay) overlay.remove();
  }

  function printReceipt() {
    const paper = document.getElementById('orderReceiptPaper');
    if (!paper) return;
    const win = window.open('', '_blank', 'width=560,height=800');
    if (!win) {
      alert('Please allow pop-ups to print the receipt.');
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Service Invoice</title><style>${STYLE}
      body { margin: 0; padding: 12px; } .iv-paper { border: 0; overflow: visible; max-width: 560px; margin: 0 auto; background: #fff; }
      @media print { body { padding: 0; } }</style></head>
      <body><div class="iv-paper">${paper.innerHTML}</div></body></html>`);
    win.document.close();
    win.focus();
    win.onload = () => { win.print(); };
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
      <div class="rc-card" role="dialog" aria-label="Service invoice">
        <div class="iv-paper" id="orderReceiptPaper">${buildReceiptHtml(order)}</div>
        <button type="button" class="rc-btn" style="background:#16a34a" id="receiptPrintBtn">Print Receipt</button>
        <button type="button" class="rc-btn" style="background:#1e3a8a" id="receiptDoneBtn">Done</button>
      </div>`;
    overlay.addEventListener('click', (event) => { if (event.target === overlay) closeReceipt(); });
    document.body.appendChild(overlay);
    document.getElementById('receiptPrintBtn').addEventListener('click', printReceipt);
    document.getElementById('receiptDoneBtn').addEventListener('click', closeReceipt);
  };
})();
