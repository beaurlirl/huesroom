// Gamepad (Xbox layout, "standard" mapping) via the browser Gamepad API.
//
//   Left stick   move (past 70% = run, like the phone joystick)
//   RB / RT      hold to run
//   A            jump · begin · Play again · resume
//   Right stick  peek the camera
//   Menu (≡)     pause / resume
//   View (⧉)     restart

const DEADZONE = 0.18;
const RUN_PUSH = 0.7;
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9 } as const;

export type PadState = {
  connected: boolean;
  moveX: number;
  moveZ: number;
  lookX: number;
  lookY: number;
  run: boolean;
  jump: boolean;
  /** Which buttons are down right now (callers do their own edge detection). */
  buttons: boolean[];
};

const state: PadState = { connected: false, moveX: 0, moveZ: 0, lookX: 0, lookY: 0, run: false, jump: false, buttons: [] };

/** Radial deadzone, rescaled so movement starts smoothly at the edge of the deadzone. */
function stick(x: number, y: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m < DEADZONE) return [0, 0];
  const k = Math.min(1, (m - DEADZONE) / (1 - DEADZONE)) / m;
  return [x * k, y * k];
}

/** Reads the first connected gamepad. Cheap; safe to call from several places per frame. */
export function pollGamepad(): PadState {
  const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = Array.from(pads).find((p): p is Gamepad => !!p && p.connected);
  state.connected = !!gp;
  if (!gp) {
    state.moveX = state.moveZ = state.lookX = state.lookY = 0;
    state.run = state.jump = false;
    state.buttons = [];
    return state;
  }
  const [mx, my] = stick(gp.axes[0] ?? 0, gp.axes[1] ?? 0);
  const [lx, ly] = stick(gp.axes[2] ?? 0, gp.axes[3] ?? 0);
  state.moveX = mx;
  state.moveZ = -my; // stick up is -1
  state.lookX = lx;
  state.lookY = ly;
  const down = gp.buttons.map((b) => b.pressed || b.value > 0.5);
  state.run = Math.hypot(mx, my) > RUN_PUSH || !!down[BTN.RB] || !!down[BTN.RT];
  state.jump = !!down[BTN.A];
  state.buttons = down;
  return state;
}

export const PAD = BTN;
