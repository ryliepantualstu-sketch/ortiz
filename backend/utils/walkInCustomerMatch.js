function resolveWalkInCustomerMatch(accounts) {
  const customerIds = [...new Set(
    (accounts || [])
      .map(account => Number(account.Customer?.customer_id))
      .filter(customerId => Number.isInteger(customerId) && customerId > 0)
  )];

  if (customerIds.length === 1) {
    return { customer_id: customerIds[0], ambiguous: false };
  }

  return { customer_id: null, ambiguous: customerIds.length > 1 };
}

module.exports = { resolveWalkInCustomerMatch };
