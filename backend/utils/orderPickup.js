function getManilaToday() {
  return getManilaDate(new Date());
}

function getManilaDate(value) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function addCalendarDays(dateValue, days) {
  const parsed = new Date(`${dateValue}T00:00:00.000Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function getReservationPickupDeadline(confirmedAt) {
  const confirmationDate = confirmedAt ? getManilaDate(confirmedAt) : getManilaToday();
  return addCalendarDays(confirmationDate, 3);
}

function isValidPickupDate(value, today = getManilaToday(), latestDate = null) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value && value >= today && (!latestDate || value <= latestDate);
}

module.exports = { getManilaToday, getManilaDate, getReservationPickupDeadline, isValidPickupDate };
