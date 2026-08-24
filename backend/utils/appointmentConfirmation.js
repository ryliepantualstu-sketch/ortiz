function buildStaffConfirmationUpdate(appointment, staffId) {
  const now = new Date();

  return {
    status: appointment?.status === 'completed' ? 'completed' : 'confirmed',
    assigned_staff_id: staffId,
    checked_in: true,
    checked_in_at: now,
    staff_confirmed: true,
    staff_confirmed_by: staffId,
    verified_at: now
  };
}

module.exports = {
  buildStaffConfirmationUpdate
};
