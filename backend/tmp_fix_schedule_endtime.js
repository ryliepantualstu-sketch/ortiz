const Schedule = require('./models/Schedule');
const { parseTimeToMinutes } = require('./utils/appointmentAvailability');
(async () => {
  try {
    const sched = await Schedule.findByPk(6);
    if (!sched) {
      console.log('Schedule id 6 not found');
      return process.exit(0);
    }
    console.log('Before:', sched.toJSON());
    const start = parseTimeToMinutes(sched.start_time);
    const end = parseTimeToMinutes(sched.end_time);
    if (start !== null && end !== null && end <= start) {
      console.log('End time <= start time; fixing to 17:00:00');
      sched.end_time = '17:00:00';
      await sched.save();
      console.log('After:', sched.toJSON());
    } else {
      console.log('Schedule times look OK; no change made');
    }
  } catch (e) {
    console.error('Error:', e && e.message ? e.message : e);
  } finally {
    process.exit(0);
  }
})();
