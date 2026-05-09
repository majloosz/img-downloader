function defaultSchedule(callback) {
  if (typeof globalThis.requestAnimationFrame === "function") {
    globalThis.requestAnimationFrame(() => callback());
    return;
  }

  setTimeout(callback, 16);
}

export function createRenderBatcher(render, schedule = defaultSchedule) {
  let scheduled = false;

  return {
    request() {
      if (scheduled) return;

      scheduled = true;
      schedule(() => {
        scheduled = false;
        render();
      });
    }
  };
}
