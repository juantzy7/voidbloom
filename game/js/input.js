const pressedQueue = new Set();

export const input = {
  keys: new Set(),
  mouse: {
    x: 0,
    y: 0,
    down: false,
  },
  dashQueued: false,
  pressed(code) {
    if (!pressedQueue.has(code)) {
      return false;
    }

    pressedQueue.delete(code);
    return true;
  },
  moveVector() {
    const left = this.keys.has("KeyA") || this.keys.has("ArrowLeft");
    const right = this.keys.has("KeyD") || this.keys.has("ArrowRight");
    const up = this.keys.has("KeyW") || this.keys.has("ArrowUp");
    const down = this.keys.has("KeyS") || this.keys.has("ArrowDown");

    let x = 0;
    let y = 0;

    if (left) {
      x -= 1;
    }
    if (right) {
      x += 1;
    }
    if (up) {
      y -= 1;
    }
    if (down) {
      y += 1;
    }

    if (x === 0 && y === 0) {
      return { x: 0, y: 0 };
    }

    const length = Math.hypot(x, y) || 1;
    return { x: x / length, y: y / length };
  },
};

let initialized = false;

function updateMousePosition(canvas, event) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width > 0 ? canvas.width / rect.width || 1 : 1;
  const scaleY = rect.height > 0 ? canvas.height / rect.height || 1 : 1;

  input.mouse.x = (event.clientX - rect.left) * scaleX;
  input.mouse.y = (event.clientY - rect.top) * scaleY;
}

function clearHeldState() {
  input.keys.clear();
  input.mouse.down = false;
}

export function initInput(canvas) {
  if (initialized) {
    return input;
  }

  initialized = true;

  window.addEventListener("keydown", (event) => {
    if (event.repeat) {
      return;
    }

    input.keys.add(event.code);
    pressedQueue.add(event.code);

    if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
      input.dashQueued = true;
    }
  });

  window.addEventListener("keyup", (event) => {
    input.keys.delete(event.code);
  });

  window.addEventListener("blur", () => {
    clearHeldState();
  });

  canvas.addEventListener("mousemove", (event) => {
    updateMousePosition(canvas, event);
  });

  canvas.addEventListener("mousedown", (event) => {
    updateMousePosition(canvas, event);

    if (event.button === 0) {
      input.mouse.down = true;
    }

    if (event.button === 2) {
      input.dashQueued = true;
    }
  });

  canvas.addEventListener("mouseup", (event) => {
    updateMousePosition(canvas, event);

    if (event.button === 0) {
      input.mouse.down = false;
    }
  });

  canvas.addEventListener("mouseleave", () => {
    input.mouse.down = false;
  });

  canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  return input;
}
