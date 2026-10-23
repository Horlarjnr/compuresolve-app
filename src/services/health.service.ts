// Business logic lives in services. Operational info only:
// no versions, env values, or dependency details.
export const getHealthStatus = () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
};
