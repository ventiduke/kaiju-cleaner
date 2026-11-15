import * as THREE from 'three';
import type { Look } from './look';
import { NOISE_GLSL } from './sky';

/**
 * River water: moving ripples that pick up the sky's colour at a glancing angle, show the
 * dark of the bed looking straight down, and glitter toward the sun. `flow` is how fast
 * the ripples travel along x (the way the current runs).
 */
export function waterMaterial(look: Look, flow: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...look.uniforms, uFlow: { value: flow }, ...THREE.UniformsLib.fog },
    transparent: true,
    depthWrite: false,
    fog: true,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 mvPosition = viewMatrix * world;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uFlow;
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uSunColor;
      uniform vec3 uSunDir;
      varying vec3 vWorld;
      #include <fog_pars_fragment>
      ${NOISE_GLSL}
      void main() {
        vec2 p = vWorld.xz * 0.06;
        vec2 drift = vec2(uTime * uFlow * 0.06, 0.0);
        float e = 0.35;
        float h0 = fbm(p - drift) + 0.5 * fbm(p * 2.7 - drift * 1.8 + 4.0);
        float hx = fbm(p + vec2(e, 0.0) - drift) + 0.5 * fbm((p + vec2(e, 0.0)) * 2.7 - drift * 1.8 + 4.0);
        float hz = fbm(p + vec2(0.0, e) - drift) + 0.5 * fbm((p + vec2(0.0, e)) * 2.7 - drift * 1.8 + 4.0);
        vec3 n = normalize(vec3((h0 - hx) * 0.9, 1.0, (h0 - hz) * 0.9));
        vec3 view = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, view), 0.0), 3.0);
        vec3 refl = reflect(-view, n);
        vec3 sky = mix(uHorizon, uTop, pow(max(refl.y, 0.0), 0.45));
        vec3 deep = vec3(0.03, 0.14, 0.2) + uTop * 0.12;
        vec3 col = mix(deep, sky, 0.12 + 0.88 * fres);
        col += uSunColor * pow(max(dot(refl, uSunDir), 0.0), 90.0) * 1.6;
        // Streaks of foam riding the current.
        float foam = smoothstep(0.74, 0.8, fbm(vec2(p.x * 0.5 - drift.x * 1.5, p.y * 3.0)));
        col = mix(col, vec3(0.9, 0.95, 1.0) * (0.4 + 0.6 * length(uSunColor)), foam * 0.12);
        gl_FragColor = vec4(col, 0.86);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
}
