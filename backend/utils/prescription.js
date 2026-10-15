function normalizePrescription(input = {}) {
  const prescription = {};

  for (const eye of ['right', 'left']) {
    const sphereValue = input[`${eye}_sph`];
    if (sphereValue === undefined || sphereValue === null || String(sphereValue).trim() === '') {
      return { prescription: null, error: `${eye === 'right' ? 'OD' : 'OS'} sphere is required` };
    }

    const sphere = Number(sphereValue);
    const cylinderValue = input[`${eye}_cyl`];
    const cylinder = cylinderValue === undefined || cylinderValue === null || String(cylinderValue).trim() === ''
      ? 0
      : Number(cylinderValue);
    const axisValue = input[`${eye}_axis`];
    const axis = axisValue === undefined || axisValue === null || String(axisValue).trim() === ''
      ? null
      : Number(axisValue);

    if (!Number.isFinite(sphere) || !Number.isFinite(cylinder)) {
      return { prescription: null, error: `${eye === 'right' ? 'OD' : 'OS'} sphere and cylinder must be valid numbers` };
    }
    if (axis !== null && (!Number.isInteger(axis) || axis < 1 || axis > 180)) {
      return { prescription: null, error: `${eye === 'right' ? 'OD' : 'OS'} axis must be a whole number from 1 to 180` };
    }
    if (cylinder !== 0 && axis === null) {
      return { prescription: null, error: `${eye === 'right' ? 'OD' : 'OS'} axis is required when cylinder is not zero` };
    }

    prescription[`${eye}_sph`] = sphere;
    prescription[`${eye}_cyl`] = cylinder;
    prescription[`${eye}_axis`] = axis;
  }

  return { prescription, error: null };
}

module.exports = { normalizePrescription };
