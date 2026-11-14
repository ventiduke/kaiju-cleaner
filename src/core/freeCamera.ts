import * as THREE from 'three';

/**
 * Minimal orbit camera: drag to orbit, wheel to zoom, right-drag to pan.
 * A press that doesn't move counts as a click (used to throw debug balls).
 */
export class FreeCamera {
  target = new THREE.Vector3(0, 8, 0);
  yaw = 0.6;
  pitch = 0.55;
  distance = 150;
  onClick: ((ndc: THREE.Vector2) => void) | null = null;
  /** While disabled, drags, wheel and double-clicks are handed to these instead (the follow camera). */
  onDrag: ((dx: number, dy: number) => void) | null = null;
  onWheel: ((deltaY: number) => void) | null = null;
  onDoubleClick: (() => void) | null = null;
  enabled = true;

  constructor(
    private camera: THREE.PerspectiveCamera,
    dom: HTMLElement,
  ) {
    let down: { x: number; y: number; button: number; moved: number } | null = null;
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('pointerdown', (e) => {
      down = { x: e.clientX, y: e.clientY, button: e.button, moved: 0 };
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      down.x = e.clientX;
      down.y = e.clientY;
      down.moved += Math.abs(dx) + Math.abs(dy);
      if (!this.enabled) {
        this.onDrag?.(dx, dy);
        return;
      }
      if (down.button === 0) {
        this.yaw -= dx * 0.005;
        this.pitch = Math.max(0.05, Math.min(1.5, this.pitch + dy * 0.005));
      } else {
        const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
        const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
        const k = this.distance * 0.0015;
        this.target.addScaledVector(right, -dx * k).addScaledVector(fwd, dy * k);
      }
    });
    dom.addEventListener('pointerup', (e) => {
      if (down && down.moved < 5 && down.button === 0 && this.onClick) {
        const r = dom.getBoundingClientRect();
        this.onClick(
          new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1),
        );
      }
      down = null;
    });
    dom.addEventListener('dblclick', () => {
      if (!this.enabled) this.onDoubleClick?.();
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (this.enabled) this.distance = Math.max(20, Math.min(600, this.distance * Math.exp(e.deltaY * 0.001)));
        else this.onWheel?.(e.deltaY);
      },
      { passive: false },
    );
  }

  update(): void {
    if (!this.enabled) return;
    const c = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * c * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * c * this.distance,
    );
    this.camera.lookAt(this.target);
  }
}
