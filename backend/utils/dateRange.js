function isValidDateRange(dateFrom, dateTo) {
  const from = dateFrom ? new Date(dateFrom) : null;
  const to = dateTo ? new Date(dateTo) : null;

  if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
    return false;
  }

  return !from || !to || from <= to;
}

module.exports = { isValidDateRange };
