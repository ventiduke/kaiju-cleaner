import type { PlayerInput } from '../sim';
import { FIXED_DT } from './physics';

const DEADZONE = 0.18;

function axis(v: number): number {
  const a = Math.abs(v);
  if (a < DEADZONE) return 0;
  return (Math.sign(v) * (a - DEADZONE)) / (1 - DEADZONE);
}

/**
 * Reads devices and writes abstract actions into each player's input slot.
 * Player 0 gets the keyboard plus the first gamepad; each further gamepad
 * drives the next player. Kaiju code only ever sees `PlayerInput`.
 */
export class InputManager {
  private keys = new Set<string>();
  /** Mouse position in pixels, and where it was when the current grab began. */
  private mouse = { x: 0, y: 0 };
  private origin = { x: 0, y: 0 };
  private mouseHeld = false;
  private wasGrabbing = false;
  /** Where the keys have nudged the balance dot to (keys move it; they don't place it). */
  private keyDot = { x: 0, z: 0 };
  private usingKeys = false;

  /**
   * @param surface the game canvas: holding the left button on it grabs, the same as holding E
   */
  constructor(
    private players: PlayerInput[],
    surface?: HTMLElement,
  ) {
    surface?.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.mouseHeld = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.mouseHeld = false;
    });
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') e.preventDefault();
      // A panel button that still has focus would be "pressed" by Space or Enter mid-game.
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && focused !== document.body) focused.blur();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('pointermove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
  }

  private key(...codes: string[]): number {
    return codes.some((c) => this.keys.has(c)) ? 1 : 0;
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
      let balanceX = 0;
      let balanceZ = 0;
      if (i === 0) {
        thrust += this.key('KeyW', 'ArrowUp') - this.key('KeyS', 'ArrowDown');
        turn += this.key('KeyA', 'ArrowLeft') - this.key('KeyD', 'ArrowRight');
        camYaw += this.key('KeyZ') - this.key('KeyQ');
        tiptoe = this.key('ShiftLeft', 'ShiftRight') > 0;
        crouch = this.key('Space') > 0;
        grab = this.key('KeyE') > 0 || this.mouseHeld;
        // The balance dot starts in the middle when a grab begins, wherever the mouse is.
        if (grab && !this.wasGrabbing) {
          this.origin.x = this.mouse.x;
          this.origin.y = this.mouse.y;
          this.keyDot.x = this.keyDot.z = 0;
          this.usingKeys = false;
        }
        this.wasGrabbing = grab;
        // Mouse: a fifth of the screen's height of travel takes the dot to the edge of the dial.
        const span = window.innerHeight * 0.2;
        const kx = this.key('KeyL') - this.key('KeyJ');
        const kz = this.key('KeyI') - this.key('KeyK');
        if (kx || kz) this.usingKeys = true;
        if (this.usingKeys) {
          // IJKL: push the dot about instead.
          this.keyDot.x = Math.max(-1, Math.min(1, this.keyDot.x + kx * 2.2 * FIXED_DT));
          this.keyDot.z = Math.max(-1, Math.min(1, this.keyDot.z + kz * 2.2 * FIXED_DT));
          balanceX = this.keyDot.x;
          balanceZ = this.keyDot.z;
        } else {
          balanceX = Math.max(-1, Math.min(1, (this.mouse.x - this.origin.x) / span));
          balanceZ = Math.max(-1, Math.min(1, -(this.mouse.y - this.origin.y) / span));
        }
      }
      const pad = pads[i];
      if (pad) {
        thrust += -axis(pad.axes[1] ?? 0);
        turn += -axis(pad.axes[0] ?? 0);
        camYaw += axis(pad.axes[2] ?? 0);
        tiptoe ||= !!pad.buttons[0]?.pressed || (pad.buttons[7]?.value ?? 0) > 0.4;
        crouch ||= !!pad.buttons[1]?.pressed || (pad.buttons[6]?.value ?? 0) > 0.4;
        if (pad.buttons[2]?.pressed || pad.buttons[5]?.pressed) {
          // While grabbing, the right stick balances instead of swinging the camera.
          grab = true;
          balanceX = axis(pad.axes[2] ?? 0);
          balanceZ = -axis(pad.axes[3] ?? 0);
          camYaw = 0;
        }
      }
      p.thrust = Math.max(-1, Math.min(1, thrust));
      p.turn = Math.max(-1, Math.min(1, turn));
      p.camYaw = Math.max(-1, Math.min(1, camYaw));
      p.tiptoe = tiptoe;
      p.crouch = crouch;
      p.grab = grab;
      p.balanceX = balanceX;
      p.balanceZ = balanceZ;
    }
  }
}
