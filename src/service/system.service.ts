function getHealthStatus() {
  return {
    ok: true,
    timestamp: new Date().toISOString(),
  }
}

export { getHealthStatus }
