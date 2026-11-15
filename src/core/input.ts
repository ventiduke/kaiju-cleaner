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
  /** Keys that went down since the last update: a tap shorter than a step still counts. */
  private tapped = new Set<string>();
  /** Clicks waiting to be passed on as a press of the grab button. */
  private clicks = 0;
  private lastY: number | null = null;
  private atEdge = 0;
  private wasGrab = false;
  /**
   * Balance shoves not yet passed on, in gauge half-lengths: moving the mouse up is positive,
   * down negative (as are I and K). Only movement counts, never where the pointer is.
   */
  private balance = 0;

  constructor(private players: PlayerInput[]) {
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
    window.addEventListener('pointermove', (e) => {
      const dy = this.lastY === null ? 0 : e.clientY - this.lastY;
      this.lastY = e.clientY;
      // With the pointer pinned to the top or bottom of the screen, keep going that way.
      this.atEdge = e.clientY <= 2 ? 1 : e.clientY >= window.innerHeight - 3 ? -1 : 0;
      // A drag is looking around, not balancing.
      if (e.buttons !== 0) return;
      // A tenth of the screen's height of travel takes the marker from the end of the gauge to the middle.
      this.balance -= dy / (window.innerHeight * 0.1);
    });
  }

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
      let breath = false;
      let bow = false;
      const balanceX = 0;
      let balanceZ = 0;
      if (i === 0) {
        thrust += this.key('KeyW', 'ArrowUp') - this.key('KeyS', 'ArrowDown');
        turn += this.key('KeyA', 'ArrowLeft') - this.key('KeyD', 'ArrowRight');
        camYaw += this.key('KeyZ') - this.key('KeyQ');
        tiptoe = this.key('ShiftLeft', 'ShiftRight') > 0;
        crouch = this.key('Space') > 0;
        breath = this.key('KeyF') > 0;
        bow = this.key('KeyV') > 0;
        // One tap of E, or one click, is one press; the game takes hold or lets go on each.
        grab = this.key('KeyE') > 0;
        if (this.clicks > 0 && !this.wasGrab) {
          grab = true;
          this.clicks--;
        }
        this.wasGrab = grab;
        this.balance += (this.key('KeyI') - this.key('KeyK') + this.atEdge) * 2.5 * FIXED_DT;
      }
      const pad = pads[i];
      if (pad) {
        thrust += -axis(pad.axes[1] ?? 0);
        turn += -axis(pad.axes[0] ?? 0);
        camYaw += axis(pad.axes[2] ?? 0);
        tiptoe ||= !!pad.buttons[0]?.pressed || (pad.buttons[7]?.value ?? 0) > 0.4;
        crouch ||= !!pad.buttons[1]?.pressed || (pad.buttons[6]?.value ?? 0) > 0.4;
        breath ||= !!pad.buttons[3]?.pressed;
        grab ||= !!pad.buttons[2]?.pressed || !!pad.buttons[5]?.pressed;
        // The right stick, pushed up or down, balances a load directly.
        if (i === 0) this.balance -= axis(pad.axes[3] ?? 0) * 2.5 * FIXED_DT;
        bow ||= !!pad.buttons[4]?.pressed;
      }
      if (i === 0) {
        // Passed on in hundredths, keeping the remainder, so that a recorded session replays exactly.
        balanceZ = Math.round(Math.max(-1, Math.min(1, this.balance)) * 100) / 100;
        this.balance = Math.abs(this.balance) > 1 ? 0 : this.balance - balanceZ;
      }
      p.thrust = Math.max(-1, Math.min(1, thrust));
      p.turn = Math.max(-1, Math.min(1, turn));
      p.camYaw = Math.max(-1, Math.min(1, camYaw));
      p.tiptoe = tiptoe;
      p.crouch = crouch;
      p.grab = grab;
      p.breath = breath;
      p.bow = bow;
      p.balanceX = balanceX;
      p.balanceZ = balanceZ;
    }
    this.tapped.clear();
  }
}
