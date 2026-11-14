import type { PlayerInput } from '../sim';

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

  constructor(private players: PlayerInput[]) {
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
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
      if (i === 0) {
        thrust += this.key('KeyW', 'ArrowUp') - this.key('KeyS', 'ArrowDown');
        turn += this.key('KeyA', 'ArrowLeft') - this.key('KeyD', 'ArrowRight');
        camYaw += this.key('KeyE') - this.key('KeyQ');
        tiptoe = this.key('ShiftLeft', 'ShiftRight') > 0;
        crouch = this.key('Space') > 0;
      }
      const pad = pads[i];
      if (pad) {
        thrust += -axis(pad.axes[1] ?? 0);
        turn += -axis(pad.axes[0] ?? 0);
        camYaw += axis(pad.axes[2] ?? 0);
        tiptoe ||= !!pad.buttons[0]?.pressed || (pad.buttons[7]?.value ?? 0) > 0.4;
        crouch ||= !!pad.buttons[1]?.pressed || (pad.buttons[6]?.value ?? 0) > 0.4;
      }
      p.thrust = Math.max(-1, Math.min(1, thrust));
      p.turn = Math.max(-1, Math.min(1, turn));
      p.camYaw = Math.max(-1, Math.min(1, camYaw));
      p.tiptoe = tiptoe;
      p.crouch = crouch;
    }
  }
}
