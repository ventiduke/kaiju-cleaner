import type { PlayerInput } from '../sim';
import { FIXED_DT } from './physics';

const DEADZONE = 0.18;

function axis(v: number): number {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  return (Math.sign(v) * (a - DEADZONE)) / (1 - DEADZONE);
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Turns "this way on the screen" into the drive-and-turn inputs the kaiju understands.
 * `fwd` and `side` are the stick (side: +1 is screen-left). With no view (tank controls)
 * they pass straight through. Otherwise the kaiju is turned toward the direction asked for
 * and driven harder the more nearly it faces it; pulling straight back just reverses, so
 * that it never spins round to walk into the camera.
 */
export function steerByScreen(fwd: number, side: number, view: { camera: number; kaiju: number } | null): { thrust: number; turn: number } {
  if (!view) return { thrust: fwd, turn: side };
  const size = Math.min(1, Math.hypot(fwd, side));
  if (size < 0.05) return { thrust: 0, turn: 0 };
  if (fwd < 0 && Math.abs(side) < 0.3) return { thrust: fwd, turn: 0 };
  // Screen-left is a quarter turn anticlockwise from the camera's heading (seen from above, +yaw).
  const want = view.camera + Math.atan2(side, fwd);
  const off = wrap(want - view.kaiju);
  const facing = Math.abs(off) < 1.3 ? Math.cos(off) : 0.12;
  return { thrust: size * facing, turn: Math.max(-1, Math.min(1, off * 2.6)) };
}

/**
 * Reads devices and writes abstract actions into each player's input slot.
 * Player 0 gets the keyboard plus the first gamepad; each further gamepad
 * drives the next player. Kaiju code only ever sees `PlayerInput`.
 */
export class InputManager {
  private keys = new Set<string>();
  /** Keys that went down since the last update: a tap shorter than a step still counts. */
  private tapped = new Set<string>();
  /** Clicks waiting to be passed on as a press of the grab button. */
  private clicks = 0;
  private wasGrab = false;

  /**
   * @param view when set and it returns headings, the direction keys steer by the screen
   *   ("up" is away from the camera) instead of turning the kaiju like a tank. Both headings
   *   are compass angles in radians (0 faces +z).
   */
  /** Where the runner's camera points (a compass heading), once there is one, and whether it is crouched. */
  private look: number | null = null;
  private crouched = false;
  private padCrouch = false;

  /**
   * @param runner tells whether the kaiju is the runner (the mouse turns the view, the keys point by the screen, C toggles a crouch)
   * @param heading the kaiju's own heading: where the runner's view starts, and what it swings round behind
   * @param follow how fast the view swings round behind it by itself (rad/s)
   */
  constructor(
    private players: PlayerInput[],
    private view: () => { camera: number; kaiju: number } | null = () => null,
    private runner: () => boolean = () => false,
    private heading: () => number = () => 0,
    private sensitivity: () => number = () => 1,
    private follow: () => number = () => 0,
  ) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') e.preventDefault();
      // A panel button that still has focus would be "pressed" by Space or Enter mid-game.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body) focused.blur();
      this.keys.add(e.code);
      if (!e.repeat) this.tapped.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  /** The mouse (or a drag) turning the runner's view: `dx` in pixels, right is positive. */
  lookBy(dx: number): void {
    if (this.look !== null) this.look -= dx * 0.0026 * this.sensitivity();
    if (dx) this.sinceLook = 0;
  }
  /** Seconds since the view was last turned by hand. */
  private sinceLook = 10;

  /** A click on the game: the same as tapping the grab key. */
  click(): void {
    this.clicks++;
  }

  private key(...codes: string[]): number {
    return codes.some((c) => this.keys.has(c) || this.tapped.has(c)) ? 1 : 0;
  }

  update(): void {
    const pads = (navigator.getGamepads?.() ?? []).filter((p): p is Gamepad => !!p && p.connected);
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      let thrust = 0;
      let turn = 0;
      let camYaw = 0;
      let tiptoe = false;
      let crouch = false;
      let grab = false;
      let bow = false;
      let jump = false;
      let strafe = 0;
      let sprint = false;
      if (i === 0) {
        const fwd = this.key('KeyW', 'ArrowUp') - this.key('KeyS', 'ArrowDown');
        const side = this.key('KeyA', 'ArrowLeft') - this.key('KeyD', 'ArrowRight');
        if (this.runner()) {
          // The runner: the keys mean "that way on the screen", and the view is the mouse's.
          this.look ??= this.heading();
          thrust += fwd;
          strafe += side;
          sprint = this.key('ShiftLeft', 'ShiftRight') > 0;
          // C toggles the crouch; jumping stands it up.
          if (this.tapped.has('KeyC')) this.crouched = !this.crouched;
          if (this.key('Space')) this.crouched = false;
        } else {
          this.look = null;
          this.crouched = false;
          const steer = steerByScreen(fwd, side, this.view());
          thrust += steer.thrust;
          turn += steer.turn;
        }
        camYaw += this.key('KeyZ') - this.key('KeyQ');
        tiptoe = !this.runner() && this.key('ShiftLeft', 'ShiftRight') > 0;
        crouch = this.runner() ? this.crouched : this.key('KeyC') > 0;
        jump = this.key('Space') > 0;
        bow = this.key('KeyV') > 0;
        // One tap of E, or one click, is one press; the game takes hold or lets go on each.
        grab = this.key('KeyE') > 0;
        if (this.clicks > 0 && !this.wasGrab) {
          grab = true;
          this.clicks--;
        }
        this.wasGrab = grab;
      }
      const pad = pads[i];
      if (pad) {
        if (i === 0 && this.runner()) {
          // Left stick moves and strafes, right stick looks, B toggles the crouch, a trigger sprints.
          thrust += -axis(pad.axes[1] ?? 0);
          strafe += -axis(pad.axes[0] ?? 0);
          this.lookBy(axis(pad.axes[2] ?? 0) * 18);
          sprint ||= (pad.buttons[7]?.value ?? 0) > 0.4 || !!pad.buttons[10]?.pressed;
          const b = !!pad.buttons[1]?.pressed;
          if (b && !this.padCrouch) this.crouched = !this.crouched;
          this.padCrouch = b;
          crouch = this.crouched;
        } else {
          const steer = steerByScreen(-axis(pad.axes[1] ?? 0), -axis(pad.axes[0] ?? 0), i === 0 ? this.view() : null);
          thrust += steer.thrust;
          turn += steer.turn;
        }
        jump ||= !!pad.buttons[0]?.pressed;
        camYaw += axis(pad.axes[2] ?? 0);
        tiptoe ||= (pad.buttons[7]?.value ?? 0) > 0.4;
        crouch ||= !!pad.buttons[1]?.pressed || (pad.buttons[6]?.value ?? 0) > 0.4;
        grab ||= !!pad.buttons[2]?.pressed || !!pad.buttons[5]?.pressed;
        bow ||= !!pad.buttons[4]?.pressed;
      }
      if (i === 0 && this.runner() && this.look !== null) {
        // Left alone, the view swings round behind a kaiju running across the screen, so that
        // holding A or D carries it round in an arc. (Never while the view is being turned by
        // hand.)
        this.sinceLook += FIXED_DT;
        const off = wrap(this.heading() - this.look);
        // (Nor for one asked to come back toward the camera: "back" should mean straight back.)
        const toward = Math.min(1, 1 + Math.cos(Math.atan2(strafe, thrust)));
        if ((thrust || strafe) && this.sinceLook > 0.4 && Math.abs(off) < 2.6) this.look += Math.sin(off) * this.follow() * toward * FIXED_DT;
      }
      p.thrust = Math.max(-1, Math.min(1, thrust));
      p.turn = Math.max(-1, Math.min(1, turn));
      p.camYaw = Math.max(-1, Math.min(1, camYaw));
      p.tiptoe = tiptoe;
      p.crouch = crouch;
      p.grab = grab;
      p.bow = bow;
      p.jump = jump;
      p.strafe = Math.max(-1, Math.min(1, strafe));
      p.sprint = sprint;
      // (To a thousandth of a radian, which is what a recorded session keeps.)
      if (i === 0) p.look = Math.round((this.look ?? 0) * 1000) / 1000;
    }
    this.tapped.clear();
  }
}
