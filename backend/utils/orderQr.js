const { Op } = require('sequelize');
const QRCode = require('../models/QRCode');
const QrcodeLibrary = require('qrcode');

function buildOrderQrPayload(order) {
  const customerName = order.customer_name || order.Customer?.User?.full_name || '';
  return `ORDER:${order.order_id}|${customerName}|${Number(order.total_amount || 0)}`;
}

async function createOrderQrCode(order, options = {}) {
  const qrCodeData = buildOrderQrPayload(order);
  await QRCode.create({
    code_type: 'Order',
    reference_id: order.order_id,
    qr_code_data: qrCodeData
  }, options);

  return {
    qr_payload: qrCodeData
  };
}

async function attachOrderQrDetails(orders) {
  if (orders.length === 0) {
    return [];
  }

  const qrCodes = await QRCode.findAll({
    where: {
      code_type: 'Order',
      reference_id: {
        [Op.in]: orders.map((order) => order.order_id)
      }
    }
  });
  const qrCodeByOrderId = new Map(
    qrCodes.map((qrCode) => [qrCode.reference_id, qrCode])
  );

  for (const order of orders) {
    if (!qrCodeByOrderId.has(order.order_id)) {
      const qrCodeData = buildOrderQrPayload(order);
      const qrCode = await QRCode.create({
        code_type: 'Order',
        reference_id: order.order_id,
        qr_code_data: qrCodeData
      });
      qrCodeByOrderId.set(order.order_id, qrCode);
    }
  }

  return Promise.all(orders.map(async (order) => {
    const qrCode = qrCodeByOrderId.get(order.order_id);
    const qrImage = qrCode
      ? await QrcodeLibrary.toDataURL(qrCode.qr_code_data)
      : null;

    return {
      ...order.toJSON(),
      qr_code: qrImage,
      qr_payload: qrCode?.qr_code_data || null,
      qr_ready: Boolean(qrCode)
    };
  }));
}

module.exports = {
  buildOrderQrPayload,
  createOrderQrCode,
  attachOrderQrDetails
};
