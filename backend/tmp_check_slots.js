const sequelize = require('./config/database');
const Schedule = require('./models/Schedule');
const BlockedSlot = require('./models/BlockedSlot');
const Appointment = require('./models/Appointment');
const { buildAppointmentSlotList, parseTimeToMinutes } = require('./utils/appointmentAvailability');

(async () => {
  try {
    const date = process.argv[2] || '2026-08-10';
    console.log('Checking slots for', date);

    const schedule = await Schedule.findOne({ where: { schedule_date: date } });
    if (!schedule) {
      // find by weekday
      const d = new Date(`${date}T00:00:00`);
      const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
      const sched2 = await Schedule.findOne({ where: { day_of_week: weekday, is_operational: true } });
      console.log('Weekday lookup:', weekday);
      if (sched2) console.log('Found schedule by weekday:', sched2.toJSON());
    } else {
      console.log('Found date-specific schedule:', schedule.toJSON());
    }

    const usedSchedule = schedule || (await (async () => {
      const d = new Date(`${date}T00:00:00`);
      const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
      return await Schedule.findOne({ where: { day_of_week: weekday, is_operational: true } });
    })());

    console.log('Effective schedule:', usedSchedule ? usedSchedule.toJSON() : null);

    const blockedSlots = await BlockedSlot.findAll({ where: { block_date: date } });
    console.log('Blocked slots:', blockedSlots.map(b => b.toJSON()));

    const existingAppointments = await Appointment.findAll({ where: { appointment_date: date, status: { [require('sequelize').Op.ne]: 'cancelled' } }, attributes: ['appointment_date','appointment_time'] });
    console.log('Existing appointments:', existingAppointments.map(a => a.toJSON()));

    if (!usedSchedule) {
      console.log('No schedule found; no slots will be available');
      process.exit(0);
    }

    const slots = buildAppointmentSlotList(date, usedSchedule.toJSON(), blockedSlots.map(b=>b.toJSON()), existingAppointments.map(a=>a.toJSON()));
    console.log('Generated slots:', JSON.stringify(slots, null, 2));
  } catch (e) {
    console.error('Error:', e && e.message ? e.message : e);
  } finally {
    process.exit(0);
  }
})();
