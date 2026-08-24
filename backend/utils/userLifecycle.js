async function archiveUser(user) {
  if (!user) {
    return { success: false, message: 'User not found' };
  }

  await user.update({ is_active: false });
  return { success: true, message: 'User archived successfully' };
}

async function restoreUser(user) {
  if (!user) {
    return { success: false, message: 'User not found' };
  }

  await user.update({ is_active: true });
  return { success: true, message: 'User restored successfully' };
}

function buildArchivedUserRecord(user) {
  if (!user) {
    return null;
  }

  return {
    archived_id: `USR-${user.user_id}`,
    type: 'user',
    record_id: user.user_id,
    name: user.full_name || user.email || 'User',
    archived_date: user.updated_at ? new Date(user.updated_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    archived_by: 'Admin User',
    reason: 'User archived',
    original_data: user
  };
}

module.exports = {
  archiveUser,
  restoreUser,
  buildArchivedUserRecord
};
