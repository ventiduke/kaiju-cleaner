import * as THREE from 'three';
import type { ChunkField } from '../city/destruction';
import { Group, groups, type RigidBody } from '../core/physics';
import type { PlayerInput, Sim, System } from '../sim';
import { Legs, type LegContext } from './legs';
import { Tail } from './tail';

export type KaijuState = 'walk' | 'stumble' | 'falling' | 'fallen' | 'getup';
export type KaijuMode = 'normal' | 'tiptoe' | 'crawl';

const UP = new THREE.Vector3(0, 1, 0);
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

/** Adds a rim of sky-coloured light round the edges of a shape, so it stands out against a dark street. */
function rimLit<T extends THREE.MeshLambertMaterial>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      /* glsl */ `#include <emissivemap_fragment>
      {
        float rim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.5);
        totalEmissiveRadiance += diffuseColor.rgb * rim * 0.55 + vec3(0.25, 0.3, 0.4) * rim * 0.25;
      }`,
    );
  };
  material.customProgramCacheKey = () => 'rim';
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
    chunks: ChunkField | null,
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

    const skin = rimLit(new THREE.MeshLambertMaterial({ color: 0x4fa37a }));
    const dark = rimLit(new THREE.MeshLambertMaterial({ color: 0x3c8463 }));
    this.buildVisual(skin, dark);
    sim.track(this.body, this.visual);

    this.tail = new Tail(
      sim,
      this.body,
      new THREE.Vector3(0, -k.bodyHalfHeight * 0.55, -k.bodyRadius * 0.75),
      skin,
      chunks,
    );
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
    const belly = new THREE.MeshLambertMaterial({ color: 0xe9dfb4 });
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const black = new THREE.MeshLambertMaterial({ color: 0x1c1f24 });
    const add = (mesh: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh => {
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      this.visual.add(mesh);
      return mesh;
    };
    add(new THREE.Mesh(new THREE.CapsuleGeometry(r, h * 2, 6, 14), skin), 0, 0, 0);
    const tum = add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.84, 14, 10), belly), 0, -h * 0.25, r * 0.36);
    tum.scale.set(0.92, 1.45, 0.86);
    // Head: big and blunt, set forward so it leads the lean.
    const headY = h + r * 0.55;
    add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 14, 10), skin), 0, headY, r * 0.45);
    add(new THREE.Mesh(new THREE.BoxGeometry(r * 1.15, r * 0.7, r * 1.2), skin), 0, headY - r * 0.25, r * 1.15);
    // The lower jaw hangs from a hinge at the back of the snout, so it can drop open.
    const jawGeometry = new THREE.BoxGeometry(r * 1.0, r * 0.16, r * 1.0);
    jawGeometry.translate(0, 0, r * 0.5);
    this.jaw = add(new THREE.Mesh(jawGeometry, belly), 0, headY - r * 0.62, r * 0.7);
    add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, r * 0.2, r * 0.9), new THREE.MeshLambertMaterial({ color: 0x7a2e3a })), 0, headY - r * 0.5, r * 1.15);
    for (const s of [-1, 1]) {
      const eye = add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.27, 12, 10), white), s * r * 0.5, headY + r * 0.42, r * 0.95);
      const pupil = add(new THREE.Mesh(new THREE.SphereGeometry(r * 0.13, 8, 6), black), s * r * 0.5, headY + r * 0.44, r * 1.19);
      // A heavy brow over each eye: most of what its face can say.
      const brow = add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, r * 0.11, r * 0.2), dark), s * r * 0.5, headY + r * 0.74, r * 1.08);
      this.face.push({ eye, pupil, brow, side: s, pupilX: pupil.position.x, pupilY: pupil.position.y, browY: brow.position.y });
      add(new THREE.Mesh(new THREE.BoxGeometry(r * 0.09, r * 0.09, r * 0.09), black), s * r * 0.25, headY - r * 0.05, r * 1.76);
      // Stubby arms.
      const armGeometry = new THREE.CapsuleGeometry(r * 0.22, r * 0.7, 4, 8);
      // Hang the arm from its shoulder end, so stretching it (to crawl on) reaches away from the body.
      armGeometry.translate(0, -r * 0.45, 0);
      const arm = add(new THREE.Mesh(armGeometry, dark), s * r * 0.98, h * 0.45, r * 0.45);
      arm.rotation.set(-1.0, 0, s * 0.35);
      this.arms.push(arm);
    }
    // Back plates.
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const plate = add(
        new THREE.Mesh(new THREE.ConeGeometry(r * (0.34 - 0.1 * Math.abs(t - 0.4)), r * 0.75, 4), dark),
        0,
        h * (0.95 - t * 1.5),
        -r * (0.82 + 0.16 * Math.sin(t * Math.PI)),
      );
      plate.rotation.x = -Math.PI / 2 + 0.35;
    }

    // Site safety: a hard hat (several sizes too small) and a hi-vis vest that will not close over the belly.
    const hatYellow = new THREE.MeshLambertMaterial({ color: 0xffc928 });
    const hat = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatYellow);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.78, r * 0.78, r * 0.07, 16), hatYellow);
    brim.position.z = r * 0.12;
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(r * 0.14, r * 0.12, r * 1.1), hatYellow);
    ridge.position.y = r * 0.56;
    ridge.scale.y = 0.6;
    hat.add(dome, brim, ridge);
    hat.position.set(0, headY + r * 0.78, r * 0.4);
    hat.rotation.x = -0.12;
    hat.traverse((o) => (o.castShadow = true));
    this.visual.add(hat);

    const vestOrange = new THREE.MeshLambertMaterial({ color: 0xff6a13, side: THREE.DoubleSide });
    const stripe = new THREE.MeshLambertMaterial({ color: 0xf2f6d0, emissive: 0x5c5f3a, side: THREE.DoubleSide });
    // Open at the front (the cylinder's seam is turned to face forward and left gaping).
    const gap = 1.25;
    const band = (radius: number, height: number, y: number, material: THREE.Material) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20, 1, true, gap / 2, Math.PI * 2 - gap), material);
      mesh.position.y = y;
      mesh.castShadow = true;
      this.visual.add(mesh);
    };
    band(r * 1.035, h * 1.0, h * 0.3, vestOrange);
    band(r * 1.05, h * 0.09, h * 0.52, stripe);
    band(r * 1.05, h * 0.09, h * 0.05, stripe);
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
    const quiet = this.mode === 'tiptoe';
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
    this.mode =
      !upright || this.carrying || this.bowTime > 0 ? 'normal' : input.crouch ? 'crawl' : input.tiptoe && !this.toeLock ? 'tiptoe' : 'normal';
    const tiptoe = this.mode === 'tiptoe';
    // Getting down and back up takes a moment.
    this.crawl = THREE.MathUtils.clamp(this.crawl + (this.mode === 'crawl' ? dt : -dt) * 1.3, 0, 1);
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
      (1 - (1 - m.crawlSpeed) * crawl) *
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
        body.applyImpulse({ x: 0, y: mass * lift * dt, z: 0 }, true);
      }
      // Nothing a standing kaiju does throws it skyward. If something does (a chunk pinched
      // against it, say), take the launch back out.
      if (standing && vel.y > 9) body.setLinvel({ x: vel.x, y: 9, z: vel.z }, true);
    }

    // --- Locomotion ---
    // Everything the feet do is a horizontal acceleration, and every horizontal
    // acceleration tips the body the other way (`lean`). That one coupling is where
    // the lean into starts and stops, the roll out of corners, and the falls come from.
    tmp.set(0, 0, 0);
    if (standing) {
      const target = this.planted || this.bowTime > 0 ? 0 : (input.thrust >= 0 ? input.thrust * k.maxSpeed : input.thrust * k.reverseSpeed) * speedShare;
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
      tmp.copy(this.forward).multiplyScalar(along).addScaledVector(this.left, across);
      // A leaning kaiju staggers the way it leans, which is also what catches it.
      tmp.x += dev.x * k.stagger * (1 - crawl);
      tmp.z += dev.z * k.stagger * (1 - crawl);
      // Standing in the river, the current leans on its legs.
      // (With its feet planted for a lift it braces against the current, and barely drifts.)
      if (this.wading > 0) tmp.x += (this.sim.current(pos.x, pos.z) * (this.planted ? 0.15 : 1) - vel.x) * 1.1 * this.wading;
      body.applyImpulse({ x: tmp.x * mass * dt, y: 0, z: tmp.z * mass * dt }, true);
      this.load = Math.hypot(tmp.x, tmp.z);
    } else this.load = 0;

    // --- Balance and turning: angular accelerations, independent of mass ---
    const av = body.angvel();
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
    ctx.standing = standing;
    ctx.stanceScale = tiptoe ? m.tiptoeStance : 1;
    ctx.footScale = tiptoe ? m.tiptoeFoot : 1;
    this.legs.update(dt, ctx);
    ctx.crawl = crawl;
    this.tail.setPose(crawl, pitch);
    if (this.sim.tick % 30 === 0) this.tail.syncMotors();
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
    for (const arm of this.arms) {
      // Standing they reach forward and down; crawling, the body's "forward" is the ground.
      arm.rotation.x = -1.0 - c * 0.57;
      arm.scale.set(1 + c * 0.7, 1 + c * 0.12, 1 + c * 0.7);
    }
    this.expression(frameDt);
  }

  /** Its face: brows that knit when things go wrong, eyes that widen and dart, a jaw that drops. */
  private expression(dt: number): void {
    const alarmed = this.state === 'falling' || this.state === 'stumble';
    const down = this.state === 'fallen' || this.state === 'getup';
    const input = this.input;
    const ease = (from: number, to: number, rate: number) => from + (to - from) * Math.min(1, dt * rate);
    // Worry: 1 knits the brows up in the middle; -1 pulls them down flat (concentrating, or cross with itself).
    this.worry = ease(this.worry, alarmed ? 1 : down ? -0.6 : this.carrying || this.mode === 'tiptoe' ? -0.45 : this.bow > 0 ? 0.7 : 0, 9);
    this.mouth = ease(this.mouth, this.state === 'falling' ? 1 : alarmed ? 0.55 : this.gasp > 0 ? 0.9 : 0.04, 12);
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
      f.pupil.position.x = ease(f.pupil.position.x, f.pupilX - input.turn * 0.09 * this.sim.tuning.kaiju.bodyRadius, 10);
      f.pupil.position.y = ease(f.pupil.position.y, f.pupilY - (this.carrying ? 0.07 : 0) * this.sim.tuning.kaiju.bodyRadius, 10);
      f.brow.rotation.z = f.side * this.worry * 0.5;
      f.brow.position.y = f.browY + (this.worry > 0 ? 0.1 : 0.04) * this.worry * this.sim.tuning.kaiju.bodyRadius;
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
