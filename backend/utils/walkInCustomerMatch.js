function normalizePhoneNumber(value) {
  return typeof value === 'string' ? value.trim().replace(/[\s()-]/g, '') : '';
}

function resolveWalkInCustomerMatch(accounts, phone) {
  const normalizedPhone = normalizePhoneNumber(phone);
  const customerIds = [...new Set(
    (accounts || [])
      .filter((account) => {
        return normalizedPhone && [account.phone, account.Customer?.phone]
          .some((accountPhone) => normalizePhoneNumber(accountPhone) === normalizedPhone);
      })
      .map(account => Number(account.Customer?.customer_id))
      .filter(customerId => Number.isInteger(customerId) && customerId > 0)
  )];

  if (customerIds.length === 1) {
    return { customer_id: customerIds[0], ambiguous: false };
  }

  return { customer_id: null, ambiguous: customerIds.length > 1 };
}

module.exports = { normalizePhoneNumber, resolveWalkInCustomerMatch };
