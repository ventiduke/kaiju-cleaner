import * as THREE from 'three';
import type { Look } from './look';

export const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x), mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * vnoise(p);
    p = p * 2.03 + vec2(17.1, 9.2);
    a *= 0.5;
  }
  return v;
}
`;

/**
 * The sky: a gradient from horizon to zenith, a sun (or moon) with a glow round it, drifting
 * clouds lit from the sun's side, and stars when it is dark. Drawn behind everything,
 * centred on the camera, so it is always infinitely far away.
 */
export function makeSky(look: Look): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    uniforms: look.uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * vec4(mat3(modelViewMatrix) * position, 1.0);
        gl_Position = p.xyww;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      uniform float uStars;
      uniform vec3 uCloud;
      uniform vec3 uCloudShade;
      uniform float uCloudCover;
      varying vec3 vDir;
      ${NOISE_GLSL}
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(uHorizon, uTop, pow(h, 0.42));
        float toSun = max(dot(d, uSunDir), 0.0);
        // The whole side of the sky the sun is on is warmer, most of all near the horizon.
        col += uSunColor * pow(toSun, 6.0) * 0.22 * (1.0 - h * 0.6);

        // Stars: one per cell of a grid wrapped round the dome, twinkling a little.
        if (uStars > 0.01) {
          vec2 sp = vec2(atan(d.z, d.x) * 60.0, d.y * 90.0);
          vec2 cell = floor(sp);
          float r = hash21(cell);
          vec2 at = fract(sp) - 0.5 - (vec2(hash21(cell + 3.1), hash21(cell + 7.7)) - 0.5) * 0.7;
          float star = smoothstep(0.09, 0.0, length(at)) * step(0.86, r);
          col += vec3(star) * uStars * (0.6 + 0.4 * sin(uTime * 2.0 + r * 40.0)) * smoothstep(0.0, 0.2, d.y);
        }

        // Sun or moon: a hard disc and a soft halo.
        col += uSunColor * (smoothstep(0.9993, 0.9996, toSun) * 6.0 + pow(toSun, 220.0) * 1.2);

        // Clouds on a flat layer overhead, thinning to nothing at the horizon.
        vec2 uv = d.xz / (d.y + 0.18) * 0.9 + vec2(uTime * 0.006, uTime * 0.002);
        float n = fbm(uv);
        float cover = smoothstep(1.0 - uCloudCover * 0.62, 1.0 - uCloudCover * 0.62 + 0.24, n) * smoothstep(0.015, 0.22, d.y);
        float lit = clamp(fbm(uv + uSunDir.xz * 0.25) - n + 0.55 + toSun * 0.5, 0.0, 1.0);
        vec3 cloud = mix(uCloudShade, uCloud, lit) + uSunColor * pow(toSun, 12.0) * 0.5;
        col = mix(col, cloud, cover * 0.9);

        // Below the horizon it is just haze.
        col = mix(col, mix(uHorizon, uTop, 0.18), smoothstep(0.0, -0.06, d.y));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'sky';
  return mesh;
}
