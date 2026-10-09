function defaultSchedule(callback) {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => callback());
    return;
  }

  setTimeout(callback, 16);
}

export function createRenderBatcher(render, schedule = defaultSchedule) {
  let scheduled = false;
  let generation = 0;

  return {
    request() {
      if (scheduled) return;

      scheduled = true;
      const batch = generation;
      schedule(() => {
        if (batch !== generation) return;
        scheduled = false;
        render();
      });
    },
    cancel() {
      generation += 1;
      scheduled = false;
    }
  };
}
