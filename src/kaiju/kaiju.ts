import * as THREE from 'three';
import type { ChunkField } from '../city/destruction';
import { Group, groups, type RigidBody } from '../core/physics';
import type { PlayerInput, Sim, System } from '../sim';
import { Legs, type LegContext } from './legs';
import { Tail } from './tail';

export type KaijuState = 'walk' | 'stumble' | 'falling' | 'fallen' | 'getup';
export type KaijuMode = 'normal' | 'tiptoe' | 'crawl';

const UP = new THREE.Vector3(0, 1, 0);
const tmpQuat = new THREE.Quaternion();
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
/** Eight directions round the compass. */
const RING = Array.from({ length: 8 }, (_, i) => [Math.sin((i * Math.PI) / 4), Math.cos((i * Math.PI) / 4)]);
const pos = new THREE.Vector3();
const vel = new THREE.Vector3();
const quat = new THREE.Quaternion();
const up = new THREE.Vector3();
const fwd = new THREE.Vector3();
const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
/** The way its spine should point (straight up, or pitched forward when crawling), and how far off that it is. */
const goal = new THREE.Vector3();
const dev = new THREE.Vector3();

function smooth(t: number): number {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

/** A bow: how far it bends (rad) and how long the whole thing takes (s). */
const BOW_PITCH = 0.95;
const BOW_SECONDS = 1.9;
/** The longest a belly-slide lasts. */
const SLIDE_SECONDS = 1.6;
/** How far forward the runner is pitched in a slide (rad): all but flat on its belly. */
const SLIDE_PITCH = 1.46;

/**
 * Adds a rim of sky-coloured light round the edges of a shape, so it stands out against a dark
 * street. With `hide`, the surface is also mottled like thick skin: blotches a hand's-breadth
 * across (at this scale, a metre or so), darker in the creases.
 */
function rimLit<T extends THREE.MeshLambertMaterial>(material: T, hide = false): T {
  material.onBeforeCompile = (shader) => {
    if (hide) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vHide;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHide = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          varying vec3 vHide;
          float hideHash(vec3 p) {
            p = fract(p * vec3(0.1031, 0.1030, 0.0973));
            p += dot(p, p.yxz + 33.33);
            return fract((p.x + p.y) * p.z);
          }
          float hideCells(vec3 p) {
            vec3 i = floor(p);
            vec3 f = fract(p);
            float near = 1.0;
            for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
              vec3 o = vec3(float(x), float(y), float(z));
              vec3 at = o + vec3(hideHash(i + o), hideHash(i + o + 7.1), hideHash(i + o + 13.7)) - f;
              near = min(near, dot(at, at));
            }
            return sqrt(near);
          }`,
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          {
            float cell = hideCells(vHide * 0.85);
            float blotch = hideHash(floor(vHide * 0.33));
            diffuseColor.rgb *= (0.8 + 0.26 * smoothstep(0.05, 0.6, cell)) * (0.93 + 0.14 * blotch);
          }`,
        );
    }
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      /* glsl */ `#include <emissivemap_fragment>
      {
        float rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.5);
        totalEmissiveRadiance += diffuseColor.rgb * rim * 0.5 + vec3(0.25, 0.3, 0.4) * rim * 0.22;
      }`,
    );
  };
  material.customProgramCacheKey = () => (hide ? 'rim-hide' : 'rim');
  return material;
}

/**
 * One kaiju: a top-heavy capsule floating on a hover spring, kept upright by a
 * deliberately under-damped balance controller. The wobble is the game.
 *
 * Nothing here is a singleton; build one per player.
 */
export class Kaiju implements System {
  readonly body: RigidBody;
  readonly visual = new THREE.Group();
  readonly tail: Tail;
  readonly legs: Legs;
  readonly rideHeight: number;
  /** Where the tail joins the body, in the body's own frame. */
  private readonly tailAnchor: THREE.Vector3;

  state: KaijuState = 'walk';
  stateTime = 0;
  /** Angle between the body's up axis and vertical, in radians. */
  tilt = 0;
  /** Heading in radians. 0 faces +z; positive turns left. */
  yaw: number;
  /** Horizontal speed, and its signed forward part. */
  speed = 0;
  forwardSpeed = 0;
  stumbles = 0;
  falls = 0;
  /** Falls caught before they landed. */
  saves = 0;
  mode: KaijuMode = 'normal';
  /** How far down on all fours it is: 0 standing, 1 crawling. */
  crawl = 0;
  private shifting = 0;
  private wasOily = false;
  /** How long it can stay on tiptoe: 1 fresh, 0 spent. */
  toeMeter = 1;
  /** How deep it is wading, 0 on dry land to 1 at leg depth. */
  wading = 0;
  /** Traction under it right now: 1 normal, near 0 on oil. */
  traction = 1;
  /** 1 while it has its hands full (set by the repair pieces system). */
  carrying = 0;
  /** True while its feet are planted for a lift: it will not walk or turn. */
  planted = false;
  /** In the air from a leap; how long a belly-slide has left (s); and how many of each it has done. */
  airborne = false;
  sliding = 0;
  jumps = 0;
  slides = 0;
  private airTime = 0;
  private slideSpeed = 0;
  private jumpHeld = false;
  private crouchHeld = false;
  // --- The runner's own state (see `runnerStep`) ---
  /** How fast it is turning (rad/s, positive to its left). */
  yawRate = 0;
  /** How far it is leaning into a turn (rad, positive to its left), and forward with its speed (rad). */
  bank = 0;
  nod = 0;
  private bankRate = 0;
  private nodRate = 0;
  /** How far its feet are skating rather than holding (0..1), and how many skids it has been in. */
  skid = 0;
  skids = 0;
  private skidding = false;
  /** How flat on its belly it is (0..1): only in a slide. */
  prone = 0;
  /** How far the last landing has pushed it down (m), and how much it is bouncing with its stride (0..1). */
  private dip = 0;
  private bounce = 0;
  /** Seconds a press of the jump key still has to be used; whether this jump has been cut short; a slide waiting for the ground. */
  private jumpBuffer = 0;
  private jumpCut = false;
  private slideQueued = false;
  /** The velocity it set itself last step (to tell, next step, whether something stopped it). */
  private askedX = 0;
  private askedZ = 0;
  private wasRunner = false;
  /** How far into a bow it is (0 upright, 1 bent right over), and how many it has made. */
  bow = 0;
  bows = 0;
  private bowTime = 0;
  private bowHeld = false;
  private bowed = false;
  private toeLock = false;
  /** True while it has to rest before it can tiptoe again. */
  get toeLocked(): boolean {
    return this.toeLock;
  }
  private stanceOffset = 0;
  /** Seconds spent pushing without getting anywhere. */
  stall = 0;
  /** Horizontal acceleration the feet are applying right now (m/s^2): what is tipping it. */
  load = 0;
  private lastForwardSpeed = 0;

  /** Horizontal facing and left vectors, refreshed every step. */
  readonly forward = new THREE.Vector3(0, 0, 1);
  readonly left = new THREE.Vector3(1, 0, 0);
  private ghost: THREE.MeshBasicMaterial | null = null;
  private arms: THREE.Mesh[] = [];
  private armSides: number[] = [];
  /** The parts of it that turn on their own (the runner's body language; the balancing kaiju leaves them be). */
  private chest = new THREE.Group();
  private neck = new THREE.Group();
  private head = new THREE.Group();
  /** Where its head is turned (rad, to its left), how hard it is breathing (0..1) and where in a breath it is, and how squashed (-) or stretched (+) it is. */
  private gaze = 0;
  private effort = 0;
  private breathing = 0;
  private squash = 0;
  private squashRate = 0;
  private armSwing = [-1, -1];
  private armReach = [0, 0];
  private wasAirborne = false;
  private jaw!: THREE.Mesh;
  private face: { eye: THREE.Mesh; pupil: THREE.Mesh; brow: THREE.Mesh; side: number; pupilX: number; pupilY: number; browY: number }[] = [];
  private blink = 2;
  private mouth = 0;
  private worry = 0;
  private readonly legContext: LegContext;

  constructor(
    private sim: Sim,
    readonly player: number,
    spawn: { x: number; z: number; yaw: number },
    private chunks: ChunkField | null,
  ) {
    const { R, world, tuning } = sim;
    const k = tuning.kaiju;
    this.rideHeight = k.legLength + k.bodyRadius + k.bodyHalfHeight;
    this.yaw = spawn.yaw;
    this.forward.set(Math.sin(spawn.yaw), 0, Math.cos(spawn.yaw));
    this.left.set(this.forward.z, 0, -this.forward.x);
    const q = new THREE.Quaternion().setFromAxisAngle(UP, spawn.yaw);

    this.body = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, this.rideHeight, spawn.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .setCanSleep(false)
        .setAdditionalSolverIterations(4),
    );
    world.createCollider(
      R.ColliderDesc.capsule(k.bodyHalfHeight, k.bodyRadius)
        .setDensity(k.density)
        .setFriction(0.35)
        .setRestitution(0)
        .setCollisionGroups(groups(Group.BODY, Group.GROUND | Group.CHUNK | Group.PROP | Group.BALL | Group.PIECE)),
      this.body,
    );
    chunks?.addHitter(this.body, k.bodyHalfHeight + k.bodyRadius);

    // Hide: a dark grey-green, mottled. (No costume: it is a monster, if a well-meaning one.)
    const skin = rimLit(new THREE.MeshLambertMaterial({ color: 0x4a5952 }), true);
    const dark = rimLit(new THREE.MeshLambertMaterial({ color: 0x333f3a }), true);
    this.buildVisual(skin, dark);
    sim.track(this.body, this.visual);

    this.tailAnchor = new THREE.Vector3(0, -k.bodyHalfHeight * 0.55, -k.bodyRadius * 0.75);
    this.tail = new Tail(sim, this.body, this.tailAnchor, skin, chunks);
    this.legContext = {
      pos: new THREE.Vector3(spawn.x, this.rideHeight, spawn.z),
      forward: this.forward,
      left: this.left,
      velocity: new THREE.Vector3(),
      yaw: this.yaw,
      standing: true,
      stanceScale: 1,
      footScale: 1,
      crawl: 0,
    };
    this.legs = new Legs(sim, chunks, this.visual, dark, this.legContext);
    this.legs.onFootfall = (side, p, strength) => this.footfall(side, p, strength);
    this.addSilhouette([...this.tail.meshes, ...this.legs.meshes]);
  }

  private get input(): PlayerInput {
    return this.sim.players[this.player] ?? this.sim.players[0];
  }

  private buildVisual(skin: THREE.Material, dark: THREE.Material): void {
    const k = this.sim.tuning.kaiju;
    const r = k.bodyRadius;
    const h = k.bodyHalfHeight;
    const belly = rimLit(new THREE.MeshLambertMaterial({ color: 0x5f5f54 }), true);
    const bone = new THREE.MeshLambertMaterial({ color: 0xd9d2bd });
    const mouth = new THREE.MeshLambertMaterial({ color: 0x5a1f26 });
    // Small, deep-set and amber: they catch the light a little, so the face reads at a distance.
    const eyeGlow = new THREE.MeshLambertMaterial({ color: 0xffb53a, emissive: 0xb86a10 });
    const black = new THREE.MeshLambertMaterial({ color: 0x0e1012 });
    // Back plates: dark, with a cold glow that only shows once the light goes.
    const plateMaterial = rimLit(new THREE.MeshLambertMaterial({ color: 0x262e2b, emissive: 0x06161b, flatShading: true }), false);
    // The parts that move on their own: the chest turns on the hips, the neck on the chest, the
    // head on the neck. Each is a group set where it hinges; `add` still takes positions in the
    // body's frame and works out where that is inside the group.
    const origins = new Map<THREE.Object3D, THREE.Vector3>();
    const hinge = (group: THREE.Group, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group => {
      const from = origins.get(parent);
      group.position.set(x - (from?.x ?? 0), y - (from?.y ?? 0), z - (from?.z ?? 0));
      origins.set(group, new THREE.Vector3(x, y, z));
      parent.add(group);
      return group;
    };
    hinge(this.chest, this.visual, 0, h * 0.1, 0);
    hinge(this.neck, this.chest, 0, h + r * 0.02, r * 0.3);
    hinge(this.head, this.neck, 0, h + r * 0.5, r * 0.75);
    const add = (mesh: THREE.Mesh, x: number, y: number, z: number, parent: THREE.Object3D = this.visual): THREE.Mesh => {
      const from = origins.get(parent);
      mesh.position.set(x - (from?.x ?? 0), y - (from?.y ?? 0), z - (from?.z ?? 0));
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const chest = this.chest;
    const head = this.head;

    // Trunk: the capsule the physics knows, thickened at the hips and across the shoulders.
    add(new THREE.Mesh(new THREE.CapsuleGeometry(r, h * 2, 6, 14), skin), 0, 0, 0);
    add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.08, 14, 10), skin), 0, -h * 0.72, -r * 0.12).scale.set(1.08, 0.95, 1.16);
    add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.98, 14, 10), skin), 0, h * 0.5, r * 0.1, chest).scale.set(1.1, 0.8, 0.98);
    // Underside: overlapping plates down the front, paler than the hide.
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const plate = add(new THREE.Mesh(new THREE.SphereGeometry(r * (0.55 + 0.2 * Math.sin(t * Math.PI)), 12, 8), belly), 0, h * (0.7 - t * 1.75), r * (0.5 + 0.14 * Math.sin(t * Math.PI)), i < 3 ? chest : this.visual);
      plate.scale.set(1, 0.36, 0.55);
    }

    // Neck and head: carried low and forward, the way a heavy animal carries it.
    const headY = h + r * 0.62;
    const neck = add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.56, r * 0.86, r * 1.25, 12), skin), 0, h + r * 0.12, r * 0.42, this.neck);
    neck.rotation.x = 0.55;
    const skull = add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 14, 10), skin), 0, headY, r * 0.98, head);
    skull.scale.set(0.98, 0.86, 1.25);
    // Snout: long and blunt, narrowing a little toward the nose.
    const snoutGeometry = new THREE.BoxGeometry(r * 0.86, r * 0.42, r * 1.25, 1, 1, 3);
    const sp = snoutGeometry.getAttribute('position');
    for (let i = 0; i < sp.count; i++) {
      const along = (sp.getZ(i) + r * 0.625) / (r * 1.25);
      sp.setX(i, sp.getX(i) * (1 - 0.3 * along));
      sp.setY(i, sp.getY(i) * (1 - 0.25 * along) + (sp.getY(i) > 0 ? -0.06 * r * along : 0));
    }
    snoutGeometry.computeVertexNormals();
    add(new THREE.Mesh(snoutGeometry, skin), 0, headY - r * 0.1, r * 1.78, head);
    // The lower jaw hangs from a hinge at the back of the head, so it can drop open.
    const jawGeometry = new THREE.BoxGeometry(r * 0.74, r * 0.17, r * 1.5);
    jawGeometry.translate(0, 0, r * 0.75);
    this.jaw = add(new THREE.Mesh(jawGeometry, skin), 0, headY - r * 0.42, r * 0.92, head);
    add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.6, r * 0.12, r * 1.2), mouth), 0, headY - r * 0.31, r * 1.6, head);
    // Teeth: a ragged row along each side of the upper jaw, and a few on the lower.
    const tooth = new THREE.ConeGeometry(r * 0.055, r * 0.2, 4);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        const z = r * (1.3 + i * 0.19);
        const inset = 1 - 0.05 * i;
        const upper = add(new THREE.Mesh(tooth, bone), side * r * 0.36 * inset, headY - r * 0.36, z, head);
        upper.rotation.x = Math.PI;
        upper.scale.setScalar(i % 2 ? 0.8 : 1.15);
        if (i % 2 === 0) add(new THREE.Mesh(tooth, bone), side * r * 0.31 * inset, r * 0.14, z - r * 0.92 + r * 0.1, this.jaw).scale.setScalar(0.9);
      }
      // Nostril.
      add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.07, r * 0.05, r * 0.1), black), side * r * 0.17, headY + r * 0.06, r * 2.38, head);

      // Eye: small, under a heavy ridge of bone.
      const eye = add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.105, 10, 8), eyeGlow), side * r * 0.47, headY + r * 0.2, r * 1.32, head);
      const pupil = add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.035, r * 0.15, r * 0.04), black), side * r * 0.5, headY + r * 0.2, r * 1.415, head);
      const brow = add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.3, r * 0.08, r * 0.34), dark), side * r * 0.46, headY + r * 0.315, r * 1.3, head);
      brow.rotation.y = side * 0.25;
      this.face.push({ eye, pupil, brow, side, pupilX: pupil.position.x, pupilY: pupil.position.y, browY: brow.position.y });
      // A short horn swept back behind each eye.
      const horn = add(new THREE.Mesh(new THREE.ConeGeometry(r * 0.12, r * 0.55, 5), bone), side * r * 0.42, headY + r * 0.52, r * 0.7, head);
      horn.rotation.x = -1.0;
      horn.rotation.z = -side * 0.25;

      // Arms: short for its size, ending in three claws.
      const armGeometry = new THREE.CapsuleGeometry(r * 0.2, r * 0.75, 4, 8);
      // Hang the arm from its shoulder end, so stretching it (to crawl on) reaches away from the body.
      armGeometry.translate(0, -r * 0.45, 0);
      const arm = add(new THREE.Mesh(armGeometry, dark), side * r * 1.0, h * 0.42, r * 0.45, chest);
      arm.rotation.set(-1.0, 0, side * 0.35);
      this.armSides.push(side);
      for (let c = -1; c <= 1; c++) {
        const claw = add(new THREE.Mesh(new THREE.ConeGeometry(r * 0.06, r * 0.3, 4), bone), c * r * 0.11, -r * 1.12, r * 0.04, arm);
        claw.rotation.x = Math.PI + 0.3;
      }
      this.arms.push(arm);
    }

    // Back plates: three ragged rows from the neck to the root of the tail, biggest in the middle of the back.
    const plateShape = new THREE.ConeGeometry(1, 1, 5);
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const size = r * (0.3 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.15)) ** 1.5);
      const y = h * (1.25 - t * 2.05);
      const back = -r * (0.72 + 0.34 * Math.sin(t * Math.PI));
      for (const row of [0, -1, 1]) {
        if (row !== 0 && (i === 0 || i === 8)) continue;
        const scale = row === 0 ? 1 : 0.55;
        const plate = add(new THREE.Mesh(plateShape, plateMaterial), row * r * 0.42, y - (row === 0 ? 0 : h * 0.06), back + Math.abs(row) * r * 0.16, y > h * 0.35 ? chest : this.visual);
        // Thin from side to side, broad from front to back: blades standing out of the spine.
        plate.scale.set(size * 0.14 * scale + 0.3, size * 1.5 * scale, size * 0.6 * scale);
        plate.rotation.x = -Math.PI / 2 + 0.5 + (i % 2) * 0.12;
        plate.rotation.z = row * 0.35;
      }
    }
  }

  /**
   * Lets the kaiju show through whatever hides it, as a flat tinted shape.
   * Every kaiju mesh marks the stencil where it is actually visible; a ghost copy of each
   * mesh then draws only where it is behind something and no kaiju pixel was drawn.
   */
  private addSilhouette(extra: THREE.Mesh[]): void {
    this.ghost = new THREE.MeshBasicMaterial({
      color: 0x8dffd0,
      transparent: true,
      opacity: 0.4,
      depthFunc: THREE.GreaterDepth,
      depthWrite: false,
      stencilWrite: true,
      stencilRef: 1,
      stencilFunc: THREE.NotEqualStencilFunc,
      // Mark what the ghost draws too, so overlapping parts don't stack up darker.
      stencilZPass: THREE.ReplaceStencilOp,
    });
    const meshes: THREE.Mesh[] = [...extra];
    this.visual.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const seen = new Set<THREE.Material>();
    for (const mesh of meshes) {
      const material = mesh.material as THREE.Material;
      if (!seen.has(material)) {
        seen.add(material);
        material.stencilWrite = true;
        material.stencilRef = 1;
        material.stencilFunc = THREE.AlwaysStencilFunc;
        material.stencilZPass = THREE.ReplaceStencilOp;
      }
      const ghost = new THREE.Mesh(mesh.geometry, this.ghost);
      ghost.renderOrder = 20;
      mesh.add(ghost);
    }
  }

  private footfall(side: number, p: THREE.Vector3, strength: number): void {
    const k = this.sim.tuning.kaiju;
    const runner = this.sim.tuning.move.controller === 1;
    // On tiptoe, or crouched as the runner, its steps are light.
    const quiet = this.mode === 'tiptoe' || (runner && this.mode === 'crawl');
    if (runner) {
      this.sim.emit('footfall', { x: p.x, y: p.y, z: p.z, side, strength: quiet ? strength * 0.25 : strength, wet: this.wading > 0.05 });
      return;
    }
    if ((this.state === 'walk' || this.state === 'stumble') && !quiet) {
      // Each step rocks the body toward the foot that just landed.
      const w = this.body.angvel();
      const kick = k.footfallKick * strength * side;
      this.body.setAngvel(
        { x: w.x - this.forward.x * kick, y: w.y, z: w.z - this.forward.z * kick },
        true,
      );
    }
    this.sim.emit('footfall', { x: p.x, y: p.y, z: p.z, side, strength: quiet ? strength * 0.25 : strength, wet: this.wading > 0.05 });
  }

  private setState(next: KaijuState): void {
    this.state = next;
    this.stateTime = 0;
  }

  preStep(dt: number): void {
    const runner = this.sim.tuning.move.controller === 1;
    if (runner !== this.wasRunner) {
      // Changing bodies mid-stride: the two keep their feet differently, so put both down first.
      this.wasRunner = runner;
      this.legs.settle();
      this.tail.weigh(runner ? 0.04 : 1);
      if (!runner) this.tail.loose();
      this.yawRate = this.bank = this.nod = this.bankRate = this.nodRate = this.skid = this.prone = this.dip = this.bounce = 0;
    }
    if (runner) {
      this.runnerStep(dt);
      return;
    }
    const k = this.sim.tuning.kaiju;
    const g = this.sim.tuning.world.gravity;
    const body = this.body;
    const mass = body.mass();
    const t = body.translation();
    const r = body.rotation();
    const lv = body.linvel();
    pos.set(t.x, t.y, t.z);
    quat.set(r.x, r.y, r.z, r.w);
    vel.set(lv.x, lv.y, lv.z);

    up.set(0, 1, 0).applyQuaternion(quat);
    // Crawling pitches the whole body forward. Its heading is then read off the pitched frame,
    // and "upright" means lined up with that pitched spine, not with the sky.
    const pitch = smooth(this.crawl) * this.sim.tuning.modes.crawlPitch + smooth(this.bow) * BOW_PITCH;
    fwd.set(0, Math.sin(pitch), Math.cos(pitch)).applyQuaternion(quat);
    fwd.y = 0;
    if (fwd.lengthSq() > 0.05) {
      this.forward.copy(fwd.normalize());
      this.yaw = Math.atan2(this.forward.x, this.forward.z);
    }
    this.left.set(this.forward.z, 0, -this.forward.x);
    goal.copy(UP).multiplyScalar(Math.cos(pitch)).addScaledVector(this.forward, Math.sin(pitch));
    this.tilt = Math.acos(THREE.MathUtils.clamp(up.dot(goal), -1, 1));
    dev.set(up.x - goal.x, 0, up.z - goal.z);
    this.forwardSpeed = vel.x * this.forward.x + vel.z * this.forward.z;
    const sideSpeed = vel.x * this.left.x + vel.z * this.left.z;
    this.speed = Math.hypot(vel.x, vel.z);

    // --- Movement mode: tiptoe and crawling trade speed for control ---
    const input = this.input;
    const m = this.sim.tuning.modes;
    const upright = this.state === 'walk' || this.state === 'stumble' || this.state === 'falling';
    if (this.toeLock && this.toeMeter > 0.5) this.toeLock = false;
    // A belly-slide: for a kaiju that can, dropping to a crawl at a run keeps the run going.
    const mv = this.sim.tuning.move;
    const crouchPressed = input.crouch && !this.crouchHeld;
    this.crouchHeld = input.crouch;
    if (crouchPressed && mv.slide && this.state === 'walk' && !this.carrying && !this.airborne && this.sliding <= 0 && this.forwardSpeed > k.maxSpeed * 0.5) {
      this.sliding = SLIDE_SECONDS;
      this.slideSpeed = this.forwardSpeed;
      this.slides++;
      this.sim.emit('kaijuSlide', { x: pos.x, y: pos.y, z: pos.z });
    }
    if (this.sliding > 0) {
      this.sliding -= dt;
      // It scrubs speed off as it goes, and is over once it is down to a crawl's pace (or knocked out of it).
      this.slideSpeed *= 1 - 0.3 * dt;
      if (!upright || this.slideSpeed < k.maxSpeed * m.crawlSpeed * 1.2) this.sliding = 0;
    }
    const slidingNow = this.sliding > 0;
    // A leap: straight up off both feet, keeping whatever speed it had.
    const jumpPressed = input.jump && !this.jumpHeld;
    this.jumpHeld = input.jump;
    if (jumpPressed && mv.jump > 0 && this.state === 'walk' && !this.airborne && !this.carrying && !this.planted && this.bowTime <= 0 && this.crawl < 0.2 && this.wading < 0.2) {
      const g = this.sim.tuning.world.gravity * mv.hangGravity;
      body.setLinvel({ x: vel.x, y: Math.sqrt(2 * g * mv.jump), z: vel.z }, true);
      this.airborne = true;
      this.airTime = 0;
      this.jumps++;
      this.sim.emit('kaijuJump', { x: pos.x, y: pos.y, z: pos.z });
    }
    if (this.airborne && !upright) this.airborne = false;
    this.mode =
      !upright || this.carrying || this.bowTime > 0 ? 'normal' : input.crouch || slidingNow ? 'crawl' : input.tiptoe && !this.toeLock ? 'tiptoe' : 'normal';
    const tiptoe = this.mode === 'tiptoe';
    // Getting down and back up takes a moment.
    this.crawl = THREE.MathUtils.clamp(this.crawl + (this.mode === 'crawl' ? dt : -dt) * (slidingNow ? 4.5 : 1.3), 0, 1);
    const crawl = smooth(this.crawl);
    // While it is on its way down or up, its spine is nowhere near where it is headed. That is
    // a change of posture, not a loss of balance: hold it firmly and don't call it a stumble.
    // A bow of apology: feet together, bend from the hips, hold it, straighten up. It has to be
    // standing quietly with its hands free to start one, and anything that upsets it ends it.
    const bowPressed = input.bow && !this.bowHeld;
    this.bowHeld = input.bow;
    if (bowPressed && this.bowTime <= 0 && this.bow === 0 && this.state === 'walk' && this.mode === 'normal' && !this.carrying && this.crawl === 0) {
      this.bowTime = BOW_SECONDS;
      this.bowed = false;
    }
    if (this.bowTime > 0) this.bowTime = this.state === 'walk' ? this.bowTime - dt : 0;
    this.bow = THREE.MathUtils.clamp(this.bow + (this.bowTime > 0.45 ? dt : -dt) * 2.4, 0, 1);
    if (this.bow >= 1 && !this.bowed) {
      this.bowed = true;
      this.bows++;
      this.sim.emit('kaijuBow', { x: pos.x, y: pos.y, z: pos.z });
    }
    if ((this.crawl > 0 && this.crawl < 1) || this.bow > 0 || this.bowTime > 0) this.shifting = 0.5;
    else this.shifting = Math.max(0, this.shifting - dt);
    const shifting = this.shifting > 0;
    this.toeMeter = THREE.MathUtils.clamp(
      this.toeMeter + (tiptoe ? -dt / m.tiptoeSeconds : dt / m.tiptoeRecover),
      0,
      1,
    );
    const speedShare =
      (tiptoe ? m.tiptoeSpeed : 1) *
      (slidingNow ? 1 : 1 - (1 - m.crawlSpeed) * crawl) *
      (1 - 0.45 * this.wading) *
      (1 - (1 - this.sim.tuning.carry.speed) * this.carrying);
    const leanScale = (tiptoe ? m.tiptoeLean : 1) * (1 - 0.9 * crawl);
    // On all fours there is hardly anything left to tip over.
    const stumbleAngle = shifting ? 3 : k.stumbleAngle * (1 + 2.5 * crawl);
    const fallAngle = shifting ? 3.1 : Math.max(k.fallAngle, stumbleAngle * 1.6);
    // How far each mode shifts the body: up on its toes, or down in a squat.
    const stance = tiptoe ? m.tiptoeRise : 0;
    this.stanceOffset += (stance - this.stanceOffset) * Math.min(1, dt * 6);

    // --- State machine ---
    this.stateTime += dt;
    // Which way it is toppling, and how well the player is steering into it:
    // turning toward the side it leans to, or running the way it pitches.
    tmp.copy(dev);
    const leaning = tmp.lengthSq() > 1e-6;
    if (leaning) tmp.normalize();
    const counter = leaning
      ? THREE.MathUtils.clamp(input.turn * tmp.dot(this.left) + input.thrust * tmp.dot(this.forward), 0, 1)
      : 0;
    if ((this.state === 'walk' || this.state === 'stumble') && this.tilt > fallAngle) {
      this.setState('falling');
    } else if (this.state === 'walk' && tiptoe && this.toeMeter <= 0) {
      // Calves give out: off the toes with a stagger.
      this.toeLock = true;
      this.setState('stumble');
      this.stumbles++;
      this.body.applyImpulse({ x: this.left.x * mass * k.stumbleLurch, y: 0, z: this.left.z * mass * k.stumbleLurch }, true);
    } else if (this.state === 'walk' && this.tilt > stumbleAngle) {
      this.setState('stumble');
      this.stumbles++;
      this.lurch(mass);
      this.sim.emit('kaijuStumble', { x: pos.x, y: pos.y, z: pos.z });
    } else if (this.state === 'stumble' && this.stateTime > k.stumbleDuration) {
      if (this.tilt < stumbleAngle * 0.75) this.setState('walk');
      else {
        // Still going over: stagger again.
        this.stateTime = 0;
        this.lurch(mass);
      }
    } else if (this.state === 'falling') {
      // Past the point of no return, unless the player catches it in time.
      if (this.tilt < stumbleAngle * 1.15) {
        this.setState('stumble');
        this.saves++;
        this.sim.emit('kaijuSave', { x: pos.x, y: pos.y, z: pos.z });
      } else if (this.stateTime > k.saveWindow || (this.tilt > 1.45 && !shifting)) {
        this.setState('fallen');
        this.falls++;
        // On oil it keeps sliding.
        body.setLinearDamping(this.traction < 0.5 ? 0.15 : 1.1);
        this.sim.emit('kaijuFall', { x: pos.x, y: pos.y, z: pos.z });
      }
    } else if (this.state === 'fallen') {
      // Up again once it has stopped sliding, sooner if the player is mashing to get up.
      // Mashing can even catch it before it has finished going down: a scramble, not a get-up.
      const eager = Math.abs(input.thrust) > 0.3 || Math.abs(input.turn) > 0.3;
      const ready = eager ? this.speed < 14 : this.speed < 4 && Math.abs(vel.y) < 2.5;
      if ((this.stateTime > (eager ? 0.5 : k.fallDuration) && ready) || this.stateTime > k.fallDuration * 2) {
        body.setLinearDamping(0);
        this.setState('getup');
      }
    } else if (this.state === 'getup') {
      if ((this.stateTime > k.getUpDuration && this.tilt < stumbleAngle * 0.75) || this.stateTime > k.getUpDuration * 2.5) {
        this.setState('walk');
      }
    }

    const standing = this.state === 'walk' || this.state === 'stumble' || this.state === 'falling';
    /** How much the hover and balance controllers are engaged (0 fallen .. 1 standing). */
    const engaged = standing ? 1 : this.state === 'getup' ? smooth(this.stateTime / k.getUpDuration) : 0;
    const control = this.state === 'walk' ? 1 : this.state === 'stumble' || this.state === 'falling' ? k.stumbleControl : 0;

    // --- Hover spring: holds the body at ride height above the ground ---
    this.wading = 0;
    if (engaged > 0) {
      // The ground it stands on is the highest point under its footprint, so it starts to
      // climb a bank before its belly reaches it, and only steps down once it is clear.
      const reach = k.bodyRadius;
      const ground = this.sim.ground;
      // Looking further ahead the faster it is going: a bank is a long climb.
      const ahead = Math.min(28, this.speed * 1.1);
      const groundY = Math.max(
        ground(pos.x, pos.z),
        ground(pos.x + this.forward.x * reach, pos.z + this.forward.z * reach),
        ground(pos.x - this.forward.x * reach, pos.z - this.forward.z * reach),
        ground(pos.x + this.left.x * reach, pos.z + this.left.z * reach),
        ground(pos.x - this.left.x * reach, pos.z - this.left.z * reach),
        this.speed > 1 ? ground(pos.x + (vel.x / this.speed) * (reach + ahead), pos.z + (vel.z / this.speed) * (reach + ahead)) : -Infinity,
        this.speed > 1 ? ground(pos.x + (vel.x / this.speed) * (reach + ahead * 0.5), pos.z + (vel.z / this.speed) * (reach + ahead * 0.5)) : -Infinity,
      );
      const hit = { timeOfImpact: pos.y - groundY };
      {
        // Below street level means standing in the river.
        this.wading = THREE.MathUtils.clamp(-ground(pos.x, pos.z) / (k.legLength * 0.8), 0, 1);
        const w = Math.PI * 2 * k.hoverFrequency;
        const zeta = this.state === 'getup' ? Math.max(k.hoverDamping, 1) : k.hoverDamping;
        // The more it tips, the lower it sinks: a toppling kaiju goes down, not just over.
        const dip = (1 - Math.cos(Math.min(this.tilt, 1.4))) * k.legLength * 0.9;
        const standingHeight = this.rideHeight + this.stanceOffset - dip + this.legs.lift * 0.6;
        const crawlHeight = k.bodyRadius + m.crawlClearance;
        const error = standingHeight + (crawlHeight - standingHeight) * crawl - hit.timeOfImpact;
        // A spring-damper near ride height. Far from it, approach no faster than the legs
        // (pushing up) or gravity (coming down) can stop it, so it arrives without bouncing.
        const brake = 1.6 * g * (error > 0 ? 0.6 : 1);
        const approach = Math.min((Math.abs(error) * w) / (2 * zeta), Math.sqrt(brake * Math.abs(error)));
        let lift = g + 2 * zeta * w * (Math.sign(error) * approach - vel.y);
        lift = THREE.MathUtils.clamp(lift, 0, g * 2.6) * engaged;
        if (this.airborne) {
          // Off the ground: nothing holds it up, and it falls faster than it rose (a leap should snap, not float).
          this.airTime += dt;
          lift = -g * (mv.hangGravity - 1);
          // (Not in the first moments: the velocity read this step is from before the push-off.)
          if (this.airTime > 0.2 && vel.y < 0 && error > -1.5) {
            // Down again, hard: the ground shakes, and anything standing close by is shaken loose.
            this.airborne = false;
            const speed = -vel.y;
            this.sim.emit('kaijuLand', { x: pos.x, y: pos.y, z: pos.z, speed });
            this.sim.emit('footfall', { x: pos.x, y: groundY, z: pos.z, side: 0, strength: 2, wet: this.wading > 0.2 });
            this.chunks?.shake(pos.x, pos.z, k.bodyRadius + 5 + speed * 0.25);
          }
        }
        body.applyImpulse({ x: 0, y: mass * lift * dt, z: 0 }, true);
      }
      // Nothing a standing kaiju does throws it skyward. If something does (a chunk pinched
      // against it, say), take the launch back out.
      if (standing && !this.airborne && vel.y > 9) body.setLinvel({ x: vel.x, y: 9, z: vel.z }, true);
    }

    // --- Locomotion ---
    // Everything the feet do is a horizontal acceleration, and every horizontal
    // acceleration tips the body the other way (`lean`). That one coupling is where
    // the lean into starts and stops, the roll out of corners, and the falls come from.
    tmp.set(0, 0, 0);
    let pitchTrim = 0;
    if (standing) {
      const target =
        this.planted || this.bowTime > 0
          ? 0
          : slidingNow
            ? this.slideSpeed
            : (input.thrust >= 0 ? input.thrust * k.maxSpeed : input.thrust * k.reverseSpeed) * speedShare;
      const diff = target * control - this.forwardSpeed;
      // Oil and the like: the feet can neither push nor hold.
      const traction = this.sim.traction(pos.x, pos.z);
      this.traction = traction;
      const speedingUp = Math.sign(diff) === Math.sign(target) && target !== 0;
      // Hands full: gentler on the pedals, or the load goes flying.
      const gentle = 1 - (1 - this.sim.tuning.carry.accel) * this.carrying;
      // Stalled against something? Lean into it: the push builds until the obstacle gives.
      // "Stalled" means gaining far less speed than it should be, whatever is limiting that.
      const gained = (this.forwardSpeed - this.lastForwardSpeed) / dt;
      this.lastForwardSpeed = this.forwardSpeed;
      const wanted = Math.abs(diff) > 1 && speedingUp;
      const expected = k.acceleration * gentle * traction * control;
      this.stall = wanted && Math.abs(gained) < expected * 0.3 ? this.stall + dt : Math.max(0, this.stall - dt * 3);
      const boost = 1 + (k.pushBoost - 1) * smooth((this.stall - 0.3) / 0.8);
      const rate = (speedingUp ? k.acceleration * boost : k.braking) * (speedingUp ? control : 1) * gentle;
      const along = THREE.MathUtils.clamp(diff / dt, -rate * traction, rate * traction);
      // The river bed is slimy: in deep water it has little sideways hold against the current.
      const hold = k.grip * traction * (1 - 0.8 * this.wading);
      const across = THREE.MathUtils.clamp(-sideSpeed / dt, -hold, hold);
      // In the air its feet are off the ground: it keeps the speed it left with, and can only nudge it.
      const footing = this.airborne ? 0.12 : 1;
      tmp.copy(this.forward).multiplyScalar(along * footing).addScaledVector(this.left, across * footing);
      // A quick kaiju would pitch itself onto its face every time it set off, if speeding up
      // tipped it as much as the same push from outside does. Only part of its own drive leans it.
      pitchTrim = along * footing * (1 - k.pitchShare);
      // A leaning kaiju staggers the way it leans, which is also what catches it.
      tmp.x += dev.x * k.stagger * (1 - crawl);
      tmp.z += dev.z * k.stagger * (1 - crawl);
      // Standing in the river, the current leans on its legs.
      // (Carrying something, it leans into the current and is pushed half as hard; with its feet planted it barely drifts.)
      if (this.wading > 0) tmp.x += (this.sim.current(pos.x, pos.z) * (this.planted ? 0.15 : this.carrying ? 0.45 : 1) - vel.x) * 1.1 * this.wading;
      body.applyImpulse({ x: tmp.x * mass * dt, y: 0, z: tmp.z * mass * dt }, true);
      this.load = Math.hypot(tmp.x, tmp.z);
    } else this.load = 0;

    // --- Balance and turning: angular accelerations, independent of mass ---
    const av = body.angvel();
    tmp.addScaledVector(this.forward, -pitchTrim);
    tmp2.crossVectors(tmp, UP).multiplyScalar(k.lean * leanScale * dt);
    tmp.set(av.x + tmp2.x, av.y, av.z + tmp2.z);
    // Oil: the feet shoot out from under it. The faster it is going, the harder it goes over,
    // backwards and a bit to one side. On tiptoe it only wobbles; on all fours it just slides.
    const oily = standing && this.traction < 0.5;
    if (oily && !this.wasOily) this.sim.emit('oilSlip', { x: pos.x, y: pos.y, z: pos.z });
    this.wasOily = oily;
    if (oily && crawl < 0.5) {
      const violence = k.oilSlip * THREE.MathUtils.clamp(this.speed / 10, 0.25, 1.6) * (tiptoe ? 0.12 : 1);
      const side = Math.sin(this.sim.time * 5.3) * 0.5;
      // Feet go forward, top goes back (and a little sideways): a turn about the left axis, reversed.
      tmp.x += (-this.left.x - this.forward.x * side) * violence * dt;
      tmp.z += (-this.left.z - this.forward.z * side) * violence * dt;
    }
    if (engaged > 0) {
      // Getting up uses a firmer, well-damped pull than everyday balance does.
      const rising = this.state === 'getup' || shifting;
      const w = Math.PI * 2 * (rising ? Math.max(k.uprightFrequency, 0.85) : k.uprightFrequency);
      const zeta = rising ? Math.max(k.uprightDamping, 0.9) : k.uprightDamping;
      // The righting pull grows with tilt up to the stumble angle, then gives way: by the
      // fall angle there is nothing left. Push it past the peak and it is going over.
      let pull = this.tilt;
      if (standing && this.tilt > stumbleAngle) {
        const span = Math.max(0.01, fallAngle - stumbleAngle);
        pull = stumbleAngle * Math.max(0, 1 - (this.tilt - stumbleAngle) / span);
      }
      // No footing, no righting pull to speak of.
      if (oily && crawl < 0.5 && !tiptoe) pull *= 0.25;
      // The save: while it is going over, steering into the fall hauls it back.
      if (this.state === 'falling' || this.state === 'stumble') pull += counter * k.saveStrength * Math.min(this.tilt, 1);
      // Axis that rotates the body's up back onto world up; its length is sin(tilt).
      tmp2.crossVectors(up, goal);
      const s = tmp2.length();
      if (s > 1e-5) tmp2.multiplyScalar((w * w * pull) / s);
      // Turning is steered separately, so the balance torque keeps out of it.
      tmp2.y = 0;
      tmp2.x -= 2 * zeta * w * av.x;
      tmp2.z -= 2 * zeta * w * av.z;
      tmp.addScaledVector(tmp2, engaged * dt);
    }
    if (standing) {
      const authority = 1 - k.turnSpeedPenalty * Math.min(1, Math.abs(this.forwardSpeed) / k.maxSpeed);
      const careful =
        (tiptoe ? m.tiptoeTurn : 1) *
        (1 - (1 - m.crawlTurn) * crawl) *
        (1 - (1 - this.sim.tuning.carry.turn) * this.carrying);
      const targetRate = this.planted || this.bowTime > 0 ? 0 : input.turn * k.maxTurnRate * authority * control * careful;
      const swing = k.turnAcceleration * (1 - (1 - this.sim.tuning.carry.turnAccel) * this.carrying);
      const accel = THREE.MathUtils.clamp((targetRate - av.y) / dt, -swing, swing);
      tmp.y += accel * dt;
    }
    body.setAngvel(tmp, true);

    // --- Legs and tail ---
    const ctx = this.legContext;
    ctx.pos.copy(pos);
    ctx.velocity.set(vel.x, 0, vel.z);
    ctx.yaw = this.yaw;
    // In the air the legs hang under the body instead of reaching for the ground.
    ctx.standing = standing && !this.airborne;
    ctx.stanceScale = tiptoe ? m.tiptoeStance : 1;
    ctx.footScale = tiptoe ? m.tiptoeFoot : 1;
    this.legs.update(dt, ctx);
    ctx.crawl = crawl;
    this.tail.setPose(crawl, pitch);
    if (this.sim.tick % 30 === 0) this.tail.syncMotors();
    this.tail.arm(this.body.linvel());
  }

  /**
   * The runner: a third-person animal in the kaiju's body. The player points (W A S D by the
   * screen, the view by the mouse) and it turns to go there: quickly from a stand, on a wider
   * arc the faster it is going, because its body can only swing round so fast and its feet can
   * only hold so much sideways. Ask for more than that and it drifts; ask for the opposite way
   * and it digs in, skids, swings round and launches. It leans into all of it. It jumps (higher
   * the longer the key is held), crouches, and at any real speed a crouch is a slide on its
   * belly. It does not wobble or fall: its weight shows in its momentum, not in its balance.
   */
  private runnerStep(dt: number): void {
    const t = this.sim.tuning;
    const k = t.kaiju;
    const r = t.runner;
    const m = t.modes;
    const g = t.world.gravity;
    const body = this.body;
    const input = this.input;
    const p = body.translation();
    const v = body.linvel();
    pos.set(p.x, p.y, p.z);
    this.state = 'walk';
    this.load = 0;
    this.stall = 0;

    // The ground under it: the highest of where it stands and a ring of points just beyond its
    // body, so that pressed against a step (a river bank) from any angle it is lifted over it.
    // (Four points on its own axes missed a bank met on the diagonal, and it stuck there.)
    const ground = this.sim.ground;
    const reach = k.bodyRadius * 1.15;
    let groundY = ground(p.x, p.z);
    for (let i = 0; i < 8; i++) groundY = Math.max(groundY, ground(p.x + RING[i][0] * reach, p.z + RING[i][1] * reach));
    this.wading = THREE.MathUtils.clamp(-ground(p.x, p.z) / (k.legLength * 0.8), 0, 1);
    const traction = this.sim.traction(p.x, p.z);
    this.traction = traction;

    let vx = v.x;
    let vz = v.z;
    let vy = v.y;
    const speed = Math.hypot(vx, vz);

    // --- What is being asked for: a direction on the ground, by the screen, and how hard.
    let push = this.planted ? 0 : Math.min(1, Math.hypot(input.thrust, input.strafe));
    let wish = input.look + Math.atan2(input.strafe, input.thrust);
    if (input.turn) {
      // (Steered by hand, by a script or a pad with no view stick: left and right of where it is facing.)
      wish = this.yaw + input.turn * 0.9;
      push = this.planted ? 0 : Math.min(1, Math.abs(input.thrust));
    }

    // --- A slide: crouching on the move throws it flat, and it rides its speed down.
    const crouchPressed = input.crouch && !this.crouchHeld;
    this.crouchHeld = input.crouch;
    // (Asked for in the air, it happens on landing.)
    if (crouchPressed && this.airborne) this.slideQueued = true;
    if (!input.crouch) this.slideQueued = false;
    if ((crouchPressed || this.slideQueued) && !this.airborne && this.sliding <= 0 && !this.carrying && this.wading < 0.3 && speed > r.speed * r.slideFrom) {
      this.sliding = 1;
      this.slideQueued = false;
      const boost = (speed + r.slideBoost) / speed;
      vx *= boost;
      vz *= boost;
      this.slides++;
      this.sim.emit('kaijuSlide', { x: p.x, y: p.y, z: p.z });
    }

    // How far it is being held up: what it asked for last step against what it got.
    const asked = Math.hypot(this.askedX, this.askedZ);
    const blocked = asked > 3 && !this.airborne ? THREE.MathUtils.smoothstep(Math.hypot(this.askedX - vx, this.askedZ - vz) / asked, 0.2, 0.55) : 0;

    const pace = THREE.MathUtils.clamp(speed / r.sprint, 0, 1);
    let turnTo = this.yaw;
    let maxTurn = THREE.MathUtils.lerp(r.turn, r.turnFast, pace) * (this.airborne ? r.airControl : 1);
    let forwardAccel = 0;
    let slip = 0;
    if (this.sliding > 0) {
      const now = Math.hypot(vx, vz);
      const next = now - r.slideFriction * (this.airborne ? 0.1 : 1) * dt;
      // Getting up ends it (keeping the speed it has left); so does running out of speed (it stays down).
      if (!input.crouch || next < r.speed * Math.max(r.crouchSpeed, 0.55)) this.sliding = 0;
      else {
        // It can be carved a little toward where the player wants to go, no more. The body follows the slide.
        const heading = Math.atan2(vx, vz);
        const want = push > 0.05 ? Math.atan2(Math.sin(wish - heading), Math.cos(wish - heading)) : 0;
        const steered = heading + THREE.MathUtils.clamp(want, -r.slideSteer * dt, r.slideSteer * dt);
        vx = Math.sin(steered) * next;
        vz = Math.cos(steered) * next;
        turnTo = steered;
        maxTurn = Math.max(maxTurn, 6);
        forwardAccel = -r.slideFriction;
      }
    }
    const sliding = this.sliding > 0;
    // (With its hands full the crouch key plants its feet instead: it stays standing, and turns
    // on the spot to face the way the player is looking, to line a piece up.)
    const low = (input.crouch && !this.carrying) || sliding;
    if (!sliding && push > 0.05) turnTo = wish;
    else if (this.planted && this.carrying && input.crouch) turnTo = input.look;

    // --- Facing: it swings toward where it is going, with a moment to get the turn started and to end it.
    const off = Math.atan2(Math.sin(turnTo - this.yaw), Math.cos(turnTo - this.yaw));
    const wantRate = THREE.MathUtils.clamp(off * 10, -maxTurn, maxTurn);
    this.yawRate += (wantRate - this.yawRate) * (1 - Math.exp(-dt / Math.max(0.01, r.turnEase)));
    this.yaw += this.yawRate * dt;
    this.forward.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.left.set(this.forward.z, 0, -this.forward.x);

    if (!sliding) {
      // --- Speed, in its own frame: along its nose, and across it.
      let u = vx * this.forward.x + vz * this.forward.z;
      let s = vx * this.left.x + vz * this.left.z;
      // Across: its feet scrub sideways speed off as hard as they can hold. Turned faster than
      // that at speed, the rest carries it wide: a drift.
      // (Not while it is pushing against something that will not move. What the wall leaves of
      // its speed is the part along the wall, and scrubbing that off as "sideways" left it stuck
      // fast to anything it met at an angle. So it slides along walls.)
      const hold = r.grip * traction * (this.airborne ? 0.04 : 1) * (1 - blocked);
      s -= THREE.MathUtils.clamp(s, -hold * dt, hold * dt);
      slip = Math.abs(s) * (1 - blocked);

      // Along: it drives for the speed asked for, in so far as it is facing that way. Asked to go
      // somewhere behind it, it brakes hard while it swings round.
      const sprinting = input.sprint && push > 0.3 && !low && !this.carrying;
      const top = (low ? r.speed * r.crouchSpeed : sprinting ? r.sprint : r.speed) * (1 - 0.45 * this.wading) * (1 - (1 - t.carry.speed) * this.carrying);
      const facing = Math.cos(off);
      const behind = push > 0.05 && facing <= 0;
      const target = push > 0.05 && !behind ? top * push * Math.max(0.3, facing) : 0;
      const launch = r.speed / Math.max(0.05, r.accel);
      const build = Math.max(1, r.sprint - r.speed) / Math.max(0.05, r.sprintBuild);
      const brake = r.speed / Math.max(0.05, r.stop);
      const before = u;
      if (u < target) {
        // Quick off the mark, and a sprint builds on top of the run. The last of it comes on gently.
        const rate = (u < r.speed * 0.98 ? launch : build) * THREE.MathUtils.clamp((target - u) / (0.2 * r.speed), 0.3, 1);
        u = Math.min(target, u + rate * traction * (this.airborne ? r.airControl : 1) * dt);
      } else {
        // Let go, it runs on a few strides; eased off (out of a sprint, into a crouch), it coasts down; reversed, it digs in.
        const rate = brake * (behind ? 1.25 : push > 0.05 ? 0.5 : 1);
        u = Math.max(target, u - rate * traction * (this.airborne ? 0.08 : 1) * dt);
        if (behind && !this.airborne) slip = Math.max(slip, u * 0.8);
      }
      forwardAccel = (u - before) / dt;
      vx = this.forward.x * u + this.left.x * s;
      vz = this.forward.z * u + this.left.z * s;
    }
    if (this.wading > 0) vx += (this.sim.current(p.x, p.z) * (this.planted ? 0.15 : this.carrying ? 0.45 : 1) - vx) * 1.1 * this.wading * dt;

    // --- Skidding: feet that have lost their hold throw up dust, and say so once as it starts.
    const skidNow = this.airborne || sliding ? 0 : THREE.MathUtils.clamp((slip - 4) / 10, 0, 1);
    this.skid += (skidNow - this.skid) * Math.min(1, dt * 16);
    if (this.skid > 0.6 && !this.skidding) {
      this.skidding = true;
      this.skids++;
      this.sim.emit('kaijuSkid', { x: p.x, y: groundY, z: p.z, strength: this.skid });
    } else if (this.skid < 0.15) this.skidding = false;
    if ((sliding || this.skid > 0.25) && !this.airborne && this.sim.tick % 4 === 0) {
      const back = sliding ? k.bodyHalfHeight : 0;
      this.sim.emit('kaijuScuff', { x: p.x - this.forward.x * back, y: groundY, z: p.z - this.forward.z * back, strength: sliding ? Math.min(1, speed / r.sprint + 0.3) : this.skid });
    }

    // --- Pose: down for a crouch, flat for a slide, and both at once (not "getting down slowly").
    this.mode = low ? 'crawl' : 'normal';
    this.crawl = THREE.MathUtils.clamp(this.crawl + (low ? dt : -dt) * 8, 0, 1);
    this.prone = THREE.MathUtils.clamp(this.prone + (sliding ? dt * 11 : -dt * 6), 0, 1);
    const crawl = smooth(this.crawl);
    const prone = smooth(this.prone);

    // --- Jumping. A press just before landing still counts; letting go early cuts it short.
    const jumpPressed = input.jump && !this.jumpHeld;
    this.jumpHeld = input.jump;
    this.jumpBuffer = jumpPressed ? 0.14 : Math.max(0, this.jumpBuffer - dt);
    if (this.jumpBuffer > 0 && !this.airborne && this.wading < 0.3 && !this.carrying && r.jump > 0) {
      vy = Math.sqrt(2 * g * r.gravity * r.jump);
      this.airborne = true;
      this.airTime = 0;
      this.jumpBuffer = 0;
      this.jumpCut = false;
      this.sliding = 0;
      this.jumps++;
      this.sim.emit('kaijuJump', { x: p.x, y: p.y, z: p.z });
    }

    // --- Height: held at standing (or crouching, or sliding) height by a stiff spring, or in free flight.
    // Running, it rises between steps and sinks onto each one; a landing pushes it down, and it comes back up.
    const stride = this.legs.striding ? Math.min(1.3, speed / r.speed) : 0;
    this.bounce += (stride - this.bounce) * Math.min(1, dt * 6);
    // (Asked for a moment early, because the spring that holds its height is a moment late: it
    // should be at its lowest in the middle of a step, not as the foot leaves the ground.)
    const lead = 0.075 * this.legs.cadence;
    const bob = -Math.cos(4 * Math.PI * (this.legs.cycle + lead - this.legs.duty / 2)) * this.rideHeight * 0.05 * this.bounce * (1 - crawl * 0.6);
    this.dip *= Math.exp(-dt * 6);
    const standingHeight = this.rideHeight + this.legs.lift * 0.6;
    const crouchHeight = k.bodyRadius + m.crawlClearance;
    const flatHeight = k.bodyRadius + k.bodyHalfHeight * Math.cos(SLIDE_PITCH) + 0.4;
    const want = standingHeight + (crouchHeight - standingHeight) * crawl + (flatHeight - crouchHeight) * prone + (bob - this.dip) * (1 - prone);
    const error = want - (p.y - groundY);
    if (this.airborne) {
      this.airTime += dt;
      // (Falls a little faster than it rises: up is effort, down is weight.)
      vy -= g * (r.gravity * (vy < 0 ? 1.2 : 1) - 1) * dt;
      if (!input.jump && !this.jumpCut && vy > 0 && this.airTime > 0.06) {
        vy *= 0.5;
        this.jumpCut = true;
      }
      if (this.airTime > 0.15 && vy < 0 && error > -1) {
        this.airborne = false;
        this.dip = Math.min(this.rideHeight * 0.3, -vy * 0.09);
        this.sim.emit('kaijuLand', { x: p.x, y: p.y, z: p.z, speed: -vy });
        this.sim.emit('footfall', { x: p.x, y: groundY, z: p.z, side: 0, strength: 2, wet: this.wading > 0.2 });
        this.chunks?.shake(p.x, p.z, k.bodyRadius + 2 + -vy * 0.15);
      }
    } else {
      // (Gravity is still pulling: cancel it, then close on the height wanted.)
      vy += g * dt;
      vy += (THREE.MathUtils.clamp(error * 14, -40, 40) - vy) * Math.min(1, dt * 20);
    }
    body.setLinvel({ x: vx, y: vy, z: vz }, true);
    this.askedX = vx;
    this.askedZ = vz;
    this.speed = Math.hypot(vx, vz);
    this.forwardSpeed = vx * this.forward.x + vz * this.forward.z;

    // --- Lean. Into the turn, by how hard it is turning for its speed (and a little more while it
    // drifts); forward as it gets going and at a sprint, back on its heels as it brakes; nose up
    // going into a jump and down coming out of it. On springs, so that it settles rather than snaps.
    const sideSlip = vx * this.left.x + vz * this.left.z;
    const bankTo =
      r.lean *
      (0.36 * THREE.MathUtils.clamp((this.yawRate * this.speed) / Math.max(1, r.grip), -1, 1) -
        0.16 * THREE.MathUtils.clamp(sideSlip / r.speed, -1, 1) +
        THREE.MathUtils.clamp(this.yawRate * 0.012, -0.12, 0.12)) *
      (this.airborne ? 0.5 : 1);
    const charge = THREE.MathUtils.smoothstep(this.speed, r.speed * 1.05, r.sprint);
    const nodTo = this.airborne
      ? THREE.MathUtils.clamp(-vy * 0.009, -0.3, 0.3)
      : r.lean * (0.17 * THREE.MathUtils.clamp(forwardAccel / (r.speed / Math.max(0.05, r.accel)), -1.5, 1) + 0.3 * charge) * (1 - crawl);
    this.bankRate += ((bankTo - this.bank) * 90 - this.bankRate * 12) * dt;
    this.bank += this.bankRate * dt;
    this.nodRate += ((nodTo - this.nod) * 70 - this.nodRate * 11) * dt;
    this.nod += this.nodRate * dt;
    this.tilt = Math.abs(this.bank);

    // Facing where it faces; pitched by the crouch, the slide and the lean; rolled about its line of travel.
    const pitch = crawl * m.crawlPitch + prone * (SLIDE_PITCH - m.crawlPitch) + this.nod * (1 - prone);
    quat
      .setFromAxisAngle(UP, this.yaw)
      .multiply(tmpQuat.setFromAxisAngle(AXIS_Z, -this.bank * (1 - 0.5 * crawl)))
      .multiply(tmpQuat.setFromAxisAngle(AXIS_X, pitch));
    body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);

    // --- Legs: a stride that turns over faster the faster it goes (and to step round a turn on the spot).
    const ctx = this.legContext;
    ctx.pos.copy(pos);
    ctx.velocity.set(vx, 0, vz);
    ctx.yaw = this.yaw;
    // In the air they are drawn up, then reach for the ground; in a slide they trail out behind.
    ctx.standing = !this.airborne && this.prone < 0.4;
    ctx.tuck = this.airborne ? THREE.MathUtils.clamp(0.45 + vy / 45, 0.05, 0.9) : 0;
    ctx.stanceScale = 1;
    ctx.footScale = 1;
    ctx.crawl = crawl;
    const going = this.speed > 1.5 || Math.abs(this.yawRate) > 1.5;
    const cadence = going ? r.cadence * (0.55 + 0.45 * Math.sqrt(Math.min(2.2, this.speed / r.speed))) + Math.abs(this.yawRate) * 0.08 : 0;
    this.legs.stride(dt, ctx, cadence, this.skid, low);

    // --- Tail: streams out behind it, held up as a counterweight the faster it goes (and high in
    // the air and in a slide); swung to the outside of a turn; and it beats with the stride, or sways idly.
    const time = this.sim.tick * dt;
    const going01 = Math.min(1, this.speed / r.speed);
    const lift = -0.25 + 0.45 * going01 + 0.13 * charge + (this.airborne ? 0.25 : 0) + prone * 0.55 - crawl * (1 - prone) * 0.05;
    const beat = this.legs.striding ? Math.sin(2 * Math.PI * this.legs.cycle) * 0.3 * going01 : Math.sin(time * 1.2) * 0.2;
    const swing = THREE.MathUtils.clamp(-this.yawRate * 0.06, -0.6, 0.6) + beat;
    // (Where the tail joins it, once this step has moved it.)
    tmp.copy(this.tailAnchor).applyQuaternion(quat).add(pos).addScaledVector(tmp2.set(vx, vy, vz), dt);
    this.tail.follow(dt, tmp, this.yaw, { x: vx, y: vy, z: vz }, r.tail, lift, swing);
    this.tail.arm(body.linvel());
  }

  /** The catch-step of a stumble: a stagger toward the side it is toppling to, which rights it a little. */
  private lurch(mass: number): void {
    const k = this.sim.tuning.kaiju;
    tmp.copy(dev);
    if (tmp.lengthSq() < 1e-6) return;
    tmp.normalize().multiplyScalar(k.stumbleLurch);
    this.body.applyImpulse({ x: tmp.x * mass, y: 0, z: tmp.z * mass }, true);
    const av = this.body.angvel();
    tmp2.crossVectors(tmp, UP).multiplyScalar(k.lean);
    this.body.setAngvel({ x: av.x + tmp2.x, y: av.y, z: av.z + tmp2.z }, true);
  }

  /**
   * Trips it: its top is thrown toward (dx, dz) and it staggers. Weak ground and sneezes do this.
   * `strength` is the kick in rad/s.
   */
  trip(dx: number, dz: number, strength: number): void {
    if (this.state !== 'walk' && this.state !== 'stumble') return;
    const len = Math.hypot(dx, dz) || 1;
    // Leaning toward a direction v is a turn about UP x v.
    const av = this.body.angvel();
    this.body.setAngvel({ x: av.x + (dz / len) * strength, y: av.y, z: av.z - (dx / len) * strength }, true);
    if (this.state === 'walk') {
      this.setState('stumble');
      this.stumbles++;
      const t = this.body.translation();
      this.sim.emit('kaijuStumble', { x: t.x, y: t.y, z: t.z });
    }
  }

  /** Knocks the kaiju flat, toppling toward `direction` (defaults to its left). For hazards and tests. */
  knockDown(direction: THREE.Vector3 = this.left): void {
    if (this.state === 'fallen') return;
    this.setState('fallen');
    this.falls++;
    this.body.setLinearDamping(1.1);
    const av = this.body.angvel();
    tmp.crossVectors(UP, direction).normalize().multiplyScalar(1.6);
    this.body.setAngvel({ x: av.x + tmp.x, y: av.y, z: av.z + tmp.z }, true);
    const t = this.body.translation();
    this.sim.emit('kaijuFall', { x: t.x, y: t.y, z: t.z });
  }

  render(alpha: number, frameDt = 1 / 60): void {
    this.legs.render(alpha, this.forward);
    if (this.ghost) this.ghost.visible = this.sim.tuning.camera.silhouette;
    // Down on all fours the arms become front legs: swung to point at the ground and stretched to reach it.
    const c = smooth(this.crawl);
    if (this.sim.tuning.move.controller === 1) this.bodyLanguage(Math.min(frameDt, 1 / 30), c);
    else {
      if (this.posed) this.unpose();
      for (const arm of this.arms) {
        // Standing they reach forward and down; crawling, the body's "forward" is the ground.
        arm.rotation.x = -1.0 - c * 0.57;
        arm.scale.set(1 + c * 0.7, 1 + c * 0.12, 1 + c * 0.7);
      }
    }
    this.expression(frameDt);
  }

  /**
   * The runner's body language, drawn over what the simulation has decided: where its head is
   * turned, how its chest and arms go with its stride, its breathing, the squash of a landing.
   * It is what makes a capsule that turns into an animal that turns. None of it feeds back
   * into the game.
   */
  private bodyLanguage(dt: number, crawl: number): void {
    const r = this.sim.tuning.runner;
    const m = this.sim.tuning.modes;
    const input = this.input;
    const ease = (from: number, to: number, rate: number) => from + (to - from) * Math.min(1, dt * rate);
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    const clamp = THREE.MathUtils.clamp;
    this.posed = true;
    const prone = smooth(this.prone);
    const pace = Math.min(1.3, this.speed / r.speed);
    const striding = this.legs.striding;
    const stride = 2 * Math.PI * this.legs.cycle;
    const push = Math.hypot(input.thrust, input.strafe);

    // Head: it looks where it is about to go and, standing, where the player is looking. And it
    // keeps its head level while the body under it pitches and rolls, as animals do.
    let look = 0;
    if (this.sliding > 0) look = 0;
    else if (push > 0.05) look = clamp(wrap(input.look + Math.atan2(input.strafe, input.thrust) - this.yaw), -1, 1) * 0.75 + clamp(this.yawRate * 0.05, -0.3, 0.3);
    else {
      const view = wrap(input.look - this.yaw);
      look = Math.abs(view) < 1.9 ? clamp(view, -1.1, 1.1) * 0.7 : 0;
    }
    this.gaze = ease(this.gaze, look, 7);
    const pitch = crawl * m.crawlPitch + prone * (SLIDE_PITCH - m.crawlPitch) + this.nod * (1 - prone);
    const level = -pitch * (0.8 + 0.1 * prone);
    const bobble = striding ? Math.sin(2 * stride) * 0.035 * Math.min(1, pace) : 0;
    this.neck.rotation.set(level * 0.5, this.gaze * 0.45, this.bank * 0.3);
    this.head.rotation.set(level * 0.5 + bobble, this.gaze * 0.55, this.bank * 0.35);

    // Chest: swings against the hips with each stride, and follows the head into a turn. It breathes,
    // harder for a while after a sprint.
    const twist = striding ? Math.sin(stride) * 0.13 * Math.min(1, pace) * (1 - prone) : 0;
    this.chest.rotation.set(0, ease(this.chest.rotation.y, twist + this.gaze * 0.18, 12), 0);
    const spent = clamp((this.speed - r.speed * 0.8) / Math.max(1, r.sprint - r.speed * 0.8), 0, 1);
    this.effort = ease(this.effort, spent, spent > this.effort ? 0.6 : 0.25);
    this.breathing += dt * (1.6 + 4.4 * this.effort);
    const breath = Math.sin(this.breathing) * (0.012 + 0.022 * this.effort);
    this.chest.scale.set(1 + breath, 1 + breath * 0.5, 1 + breath * 1.5);

    // Arms: front legs on all fours, flung out ahead in a slide, up going into a jump; otherwise
    // they pump against the legs, tucked in closer the faster it goes.
    const charge = THREE.MathUtils.smoothstep(this.speed, r.speed * 1.05, r.sprint);
    for (let i = 0; i < this.arms.length; i++) {
      const arm = this.arms[i];
      const side = this.armSides[i];
      const pump = striding ? side * Math.cos(stride) * Math.min(1, pace) : 0;
      let swing: number;
      let spread = 0.35;
      if (prone > 0.5) swing = -2.75;
      else if (this.airborne) {
        swing = this.body.linvel().y > 0 ? -2.2 : -0.7;
        spread = 0.8;
      } else if (crawl > 0.5) swing = -1.57 - pump * 0.3;
      else swing = -1.0 + 0.3 * charge + pump * 0.55;
      this.armSwing[i] = ease(this.armSwing[i], swing, 14);
      this.armReach[i] = ease(this.armReach[i], crawl * (1 - prone), 14);
      const reach = this.armReach[i];
      arm.rotation.x = this.armSwing[i];
      arm.rotation.z = ease(arm.rotation.z, side * spread, 10);
      arm.scale.set(1 + reach * 0.7, 1 + reach * 0.12, 1 + reach * 0.7);
    }

    // Squash and stretch: long for a moment as it leaves the ground, squat for a moment as it comes back.
    if (this.airborne !== this.wasAirborne) this.squashRate += this.airborne ? 1.1 : -1.6;
    this.wasAirborne = this.airborne;
    this.squashRate += (-this.squash * 180 - this.squashRate * 15) * dt;
    this.squash = clamp(this.squash + this.squashRate * dt, -0.16, 0.14);
    this.visual.scale.set(1 - this.squash * 0.5, 1 + this.squash, 1 - this.squash * 0.5);
  }

  private posed = false;

  /** Puts the parts the runner moves back as they were built (for the balancing kaiju). */
  private unpose(): void {
    this.posed = false;
    for (const part of [this.chest, this.neck, this.head]) {
      part.rotation.set(0, 0, 0);
      part.scale.set(1, 1, 1);
    }
    this.visual.scale.set(1, 1, 1);
    this.arms.forEach((arm, i) => (arm.rotation.z = this.armSides[i] * 0.35));
    this.gaze = this.squash = this.squashRate = 0;
  }

  /** Its face: brows that knit when things go wrong, eyes that widen and dart, a jaw that drops. */
  private expression(dt: number): void {
    const alarmed = this.state === 'falling' || this.state === 'stumble';
    const down = this.state === 'fallen' || this.state === 'getup';
    const input = this.input;
    const ease = (from: number, to: number, rate: number) => from + (to - from) * Math.min(1, dt * rate);
    // Worry: 1 knits the brows up in the middle; -1 pulls them down flat (concentrating, or cross with itself).
    this.worry = ease(this.worry, alarmed ? 1 : down ? -0.6 : this.carrying || this.mode === 'tiptoe' ? -0.45 : this.bow > 0 ? 0.7 : 0, 9);
    // (The runner's jaw drops in the air and in a slide, and it pants after a sprint.)
    const runner = this.sim.tuning.move.controller === 1;
    // (Not far in a slide: its chin is on the road.)
    const thrill = !runner ? 0 : this.airborne ? 0.5 : this.sliding > 0 ? 0.25 : this.effort * (0.16 + 0.1 * Math.sin(this.breathing));
    this.mouth = ease(this.mouth, this.state === 'falling' ? 1 : alarmed ? 0.55 : this.gasp > 0 ? 0.9 : Math.max(0.04, thrill), 12);
    this.gasp = Math.max(0, this.gasp - dt);
    this.jaw.rotation.x = this.mouth * 0.55;
    this.blink -= dt;
    if (this.blink < -0.13) this.blink = 1.5 + ((this.sim.tick * 7919) % 300) / 100;
    const shut = down ? 0.25 : this.blink < 0 && !alarmed ? 0.08 : this.bow > 0.5 ? 0.15 : 1;
    const wide = 1 + 0.3 * Math.max(0, this.worry);
    for (const f of this.face) {
      f.eye.scale.set(wide, wide * shut, wide);
      f.pupil.visible = shut > 0.3;
      // Pupils lead a turn, and shrink to dots in alarm.
      const size = alarmed ? 0.6 : 1;
      f.pupil.scale.setScalar(size);
      f.pupil.position.x = ease(f.pupil.position.x, f.pupilX + (runner ? this.gaze * 0.9 : -input.turn) * 0.09 * this.sim.tuning.kaiju.bodyRadius, 10);
      f.pupil.position.y = ease(f.pupil.position.y, f.pupilY - (this.carrying ? 0.07 : 0) * this.sim.tuning.kaiju.bodyRadius, 10);
      f.brow.rotation.z = f.side * this.worry * 0.5;
      f.brow.position.y = f.browY + (this.worry > 0 ? 0.06 : 0.03) * this.worry * this.sim.tuning.kaiju.bodyRadius;
    }
  }

  /** Makes it gape for a moment (a sneeze coming, a nasty surprise). */
  startle(seconds = 0.6): void {
    this.gasp = seconds;
  }
  private gasp = 0;

  position(target = new THREE.Vector3()): THREE.Vector3 {
    const t = this.body.translation();
    return target.set(t.x, t.y, t.z);
  }
}
