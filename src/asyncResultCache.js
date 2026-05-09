export function createAsyncResultCache(loadValue) {
  const resolvedValues = new Map();
  const pendingValues = new Map();

  return {
    async get(key) {
      if (resolvedValues.has(key)) {
        return resolvedValues.get(key);
      }

      if (pendingValues.has(key)) {
        return pendingValues.get(key);
      }

      const pending = Promise.resolve()
        .then(() => loadValue(key))
        .then(
          (value) => {
            pendingValues.delete(key);
            resolvedValues.set(key, value);
            return value;
          },
          (error) => {
            pendingValues.delete(key);
            throw error;
          }
        );

      pendingValues.set(key, pending);
      return pending;
    }
  };
}
