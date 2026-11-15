import * as THREE from 'three';

/** Everything about the light at one time of day. Colours are sRGB hex. */
interface Key {
  hour: number;
  top: number;
  horizon: number;
  sun: number;
  sunPower: number;
  /** Sun (or moon) height above the horizon and compass bearing, in degrees. */
  elevation: number;
  bearing: number;
  hemiSky: number;
  hemiGround: number;
  hemiPower: number;
  /** Share of windows with a light on, and how brightly they glow. */
  lit: number;
  stars: number;
  cloud: number;
  cloudShade: number;
  exposure: number;
}

const KEYS: Key[] = [
  { hour: 6, top: 0x34509a, horizon: 0xf2a37c, sun: 0xffb98a, sunPower: 1.2, elevation: 5, bearing: 70, hemiSky: 0x9fb2e6, hemiGround: 0x6a5a55, hemiPower: 0.85, lit: 0.3, stars: 0, cloud: 0xffd9c2, cloudShade: 0x8a7fa6, exposure: 1.0 },
  { hour: 9, top: 0x3d7fd8, horizon: 0xcfe3f5, sun: 0xfff0d8, sunPower: 2.5, elevation: 38, bearing: 55, hemiSky: 0xcfe2ff, hemiGround: 0x6f6c5c, hemiPower: 1.15, lit: 0.04, stars: 0, cloud: 0xffffff, cloudShade: 0xa9b8cf, exposure: 1.0 },
  { hour: 13, top: 0x2f74d6, horizon: 0xbfdcf5, sun: 0xfff6e8, sunPower: 2.8, elevation: 64, bearing: 20, hemiSky: 0xd6e6ff, hemiGround: 0x74705c, hemiPower: 1.2, lit: 0, stars: 0, cloud: 0xffffff, cloudShade: 0xb3c0d4, exposure: 0.95 },
  { hour: 17.4, top: 0x3a6fc4, horizon: 0xffc98e, sun: 0xffb872, sunPower: 3.1, elevation: 17, bearing: 305, hemiSky: 0xb9c8ff, hemiGround: 0x7d6650, hemiPower: 1.05, lit: 0.1, stars: 0, cloud: 0xffe2c0, cloudShade: 0x9a86a8, exposure: 1.15},
  { hour: 19.2, top: 0x26357c, horizon: 0xff8757, sun: 0xff7a48, sunPower: 1.5, elevation: 4, bearing: 262, hemiSky: 0x7f8fd8, hemiGround: 0x5c4a52, hemiPower: 0.85, lit: 0.42, stars: 0.25, cloud: 0xff9f7a, cloudShade: 0x4a4780, exposure: 1.25},
  { hour: 20.1, top: 0x101a48, horizon: 0x5a3f73, sun: 0x8fa6ff, sunPower: 0.25, elevation: 30, bearing: 320, hemiSky: 0x5466b8, hemiGround: 0x3a3548, hemiPower: 0.7, lit: 0.6, stars: 0.8, cloud: 0x6a5f96, cloudShade: 0x222650, exposure: 1.3},
  { hour: 22, top: 0x050a1f, horizon: 0x1b2552, sun: 0xa9bbff, sunPower: 0.75, elevation: 42, bearing: 325, hemiSky: 0x4558ad, hemiGround: 0x2c2a3c, hemiPower: 0.7, lit: 0.62, stars: 1, cloud: 0x4a5488, cloudShade: 0x141a3a, exposure: 1.35},
];

/** Times of day worth jumping straight to (the T key cycles through them). */
export const HOURS = [17.4, 19.2, 22, 9, 13];

const a = new THREE.Color();
const b = new THREE.Color();
function mixHex(target: THREE.Color, x: number, y: number, t: number): THREE.Color {
  return target.copy(a.setHex(x)).lerp(b.setHex(y), t);
}

/**
 * The look of the world at a time of day: sky, sun, ambient light, fog and how many windows
 * are lit. It owns the lights, and a set of shader uniforms that the sky, the building
 * fronts and the water all read, so they change together.
 */
export class Look {
  readonly uniforms = {
    uTime: { value: 0 },
    uTop: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uLit: { value: 0 },
    uStars: { value: 0 },
    uCloud: { value: new THREE.Color() },
    uCloudShade: { value: new THREE.Color() },
    uCloudCover: { value: 0.55 },
  };
  /** Where the sun light sits relative to whatever it is following (see main.ts). */
  readonly sunOffset = new THREE.Vector3();
  exposure = 1;
  hour = -1;
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly fog: THREE.Fog;

  constructor(
    private scene: THREE.Scene,
    private extent: number,
  ) {
    this.fog = new THREE.Fog(0xffffff, extent * 0.55, extent * 3.4);
    scene.fog = this.fog;
    scene.background = new THREE.Color();
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1);
    scene.add(this.hemi, this.sun, this.sun.target);
    this.set(17.4);
  }

  /** Moves to a time of day (0-24; anything outside the keys holds the nearest). */
  set(hour: number): void {
    if (hour === this.hour) return;
    this.hour = hour;
    let i = 0;
    while (i < KEYS.length - 2 && hour > KEYS[i + 1].hour) i++;
    const k0 = KEYS[i];
    const k1 = KEYS[i + 1];
    const t = THREE.MathUtils.clamp((hour - k0.hour) / (k1.hour - k0.hour), 0, 1);
    const mix = (x: number, y: number) => x + (y - x) * t;
    const u = this.uniforms;
    mixHex(u.uTop.value, k0.top, k1.top, t);
    mixHex(u.uHorizon.value, k0.horizon, k1.horizon, t);
    mixHex(u.uCloud.value, k0.cloud, k1.cloud, t);
    mixHex(u.uCloudShade.value, k0.cloudShade, k1.cloudShade, t);
    mixHex(this.sun.color, k0.sun, k1.sun, t);
    u.uSunColor.value.copy(this.sun.color);
    this.sun.intensity = mix(k0.sunPower, k1.sunPower);
    mixHex(this.hemi.color, k0.hemiSky, k1.hemiSky, t);
    mixHex(this.hemi.groundColor, k0.hemiGround, k1.hemiGround, t);
    this.hemi.intensity = mix(k0.hemiPower, k1.hemiPower);
    u.uLit.value = mix(k0.lit, k1.lit);
    u.uStars.value = mix(k0.stars, k1.stars);
    this.exposure = mix(k0.exposure, k1.exposure);

    const elevation = THREE.MathUtils.degToRad(mix(k0.elevation, k1.elevation));
    const bearing = THREE.MathUtils.degToRad(mix(k0.bearing, k1.bearing));
    u.uSunDir.value.set(Math.sin(bearing) * Math.cos(elevation), Math.sin(elevation), Math.cos(bearing) * Math.cos(elevation));
    // The light itself never comes in flatter than 24 degrees: shadows a mile long are all smear.
    const lightElevation = Math.max(elevation, THREE.MathUtils.degToRad(24));
    this.sunOffset
      .set(Math.sin(bearing) * Math.cos(lightElevation), Math.sin(lightElevation), Math.cos(bearing) * Math.cos(lightElevation))
      .multiplyScalar(this.extent * 0.9);
    this.sun.position.copy(this.sunOffset);

    // Distance fades to the colour of the horizon.
    this.fog.color.copy(u.uHorizon.value).lerp(u.uTop.value, 0.18);
    (this.scene.background as THREE.Color).copy(this.fog.color);
  }
}
