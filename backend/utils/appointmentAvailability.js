function normalizeAppointmentDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];

  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString().slice(0, 10);
  }

  return text.slice(0, 10);
}

function normalizeAppointmentTime(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2] || '0');

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function parseTimeToMinutes(value) {
  if (!value) return null;

  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})(?::(\d{2}))?/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2] || '0');

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

function formatMinutesToTime(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function isTimeWithinSchedule(appointmentTime, startTime, endTime) {
  const appointmentMinutes = parseTimeToMinutes(appointmentTime);
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (appointmentMinutes === null || startMinutes === null || endMinutes === null) {
    return false;
  }

  return appointmentMinutes >= startMinutes && appointmentMinutes < endMinutes;
}

const DEFAULT_LUNCH_BREAKS = [
  { start_time: '12:00', end_time: '13:30' }
];

function buildAppointmentSlotList(date, schedule, blockedSlots = [], existingAppointments = []) {
  if (!schedule || !schedule.start_time || !schedule.end_time) {
    return [];
  }

  const startMinutes = parseTimeToMinutes(schedule.start_time);
  const endMinutes = parseTimeToMinutes(schedule.end_time);
  const slotDuration = Number(schedule.slot_duration_minutes || 30);

  if (startMinutes === null || endMinutes === null || slotDuration <= 0) {
    return [];
  }

  const slots = [];
  let currentMinutes = startMinutes;

  while (currentMinutes + slotDuration <= endMinutes) {
    const startTime = formatMinutesToTime(currentMinutes);
    const endTime = formatMinutesToTime(currentMinutes + slotDuration);

    const isBlocked = (blockedSlots || []).some((blockedSlot) => {
      const blockStart = parseTimeToMinutes(blockedSlot.start_time);
      const blockEnd = parseTimeToMinutes(blockedSlot.end_time);
      return blockStart !== null && blockEnd !== null && currentMinutes < blockEnd && currentMinutes + slotDuration > blockStart;
    }) || DEFAULT_LUNCH_BREAKS.some((blockedSlot) => {
      const blockStart = parseTimeToMinutes(blockedSlot.start_time);
      const blockEnd = parseTimeToMinutes(blockedSlot.end_time);
      return blockStart !== null && blockEnd !== null && currentMinutes < blockEnd && currentMinutes + slotDuration > blockStart;
    });

    const isBooked = (existingAppointments || []).some((appointment) => {
      const appointmentDate = normalizeAppointmentDate(appointment.appointment_date);
      const appointmentTime = normalizeAppointmentTime(appointment.appointment_time);
      return appointmentDate === normalizeAppointmentDate(date) && appointmentTime === startTime;
    });

    const available = !isBlocked && !isBooked;
    let reason = null;
    if (!available) {
      if (isBooked) {
        reason = 'Booked';
      } else if (DEFAULT_LUNCH_BREAKS.some((blockedSlot) => {
        const blockStart = parseTimeToMinutes(blockedSlot.start_time);
        const blockEnd = parseTimeToMinutes(blockedSlot.end_time);
        return blockStart !== null && blockEnd !== null && currentMinutes < blockEnd && currentMinutes + slotDuration > blockStart;
      })) {
        reason = 'Lunch break';
      } else {
        reason = 'Blocked';
      }
    }

    slots.push({ start_time: startTime, end_time: endTime, available, reason });
    currentMinutes += slotDuration;
  }

  return slots;
}

function buildAvailableAppointmentSlots(date, schedule, blockedSlots = [], existingAppointments = []) {
  return buildAppointmentSlotList(date, schedule, blockedSlots, existingAppointments).filter((slot) => slot.available);
}

module.exports = {
  parseTimeToMinutes,
  formatMinutesToTime,
  normalizeAppointmentDate,
  normalizeAppointmentTime,
  isTimeWithinSchedule,
  buildAvailableAppointmentSlots,
  buildAppointmentSlotList
};
