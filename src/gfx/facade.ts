import * as THREE from 'three';
import type { Look } from './look';

/** Which faces of a block are outside walls. One bit each, stored per instance. */
export const Face = { PX: 1, NX: 2, PZ: 4, NZ: 8, ROOF: 16, STREET: 32 } as const;

/**
 * The material for building blocks. Each block is a plain box; this paints windows on
 * whichever of its faces are outside walls, a shopfront along the street, and gravel and a
 * parapet on the roof. Inside faces (only seen once the building is broken open) stay bare
 * concrete. Some windows are lit, more of them as it gets dark.
 *
 * The pattern is worked out from the block's own size, so it stays put on the block as it
 * falls. Instanced blocks carry their face bits and a random seed in the `aFace` attribute;
 * a lone mesh passes them in `face` and `seed`.
 */
export function facadeMaterial(look: Look | undefined, opts: { face?: number; seed?: number; color?: number } = {}): THREE.MeshLambertMaterial {
  const material = new THREE.MeshLambertMaterial({ color: opts.color ?? 0xffffff });
  const own = { uFace: { value: new THREE.Vector2(opts.face ?? 0, opts.seed ?? 0) } };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLit = look ? look.uniforms.uLit : { value: 0 };
    shader.uniforms.uFace = own.uFace;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        #ifdef USE_INSTANCING
          attribute vec2 aFace;
        #else
          uniform vec2 uFace;
        #endif
        varying vec3 vBox;
        varying vec3 vHalf;
        varying vec3 vBoxNormal;
        flat varying vec2 vFace;`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 boxSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vBox = position * boxSize;
          vHalf = boxSize * 0.5;
          vFace = aFace;
        #else
          vBox = position;
          vHalf = abs(position);
          vFace = uFace;
        #endif
        vBoxNormal = normal;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uLit;
        varying vec3 vBox;
        varying vec3 vHalf;
        varying vec3 vBoxNormal;
        flat varying vec2 vFace;
        float fhash(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }
        vec3 windowGlow = vec3(0.0);`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          int bits = int(vFace.x + 0.5);
          vec3 n = vBoxNormal;
          vec3 wall = diffuseColor.rgb;
          if (n.y > 0.5) {
            if ((bits & 16) != 0) {
              // Roof: gravel, with a paler parapet round the outside edges of the building.
              vec3 gravel = wall * 0.55 + vec3(0.06);
              float edge = 0.0;
              if ((bits & 1) != 0) edge = max(edge, smoothstep(vHalf.x - 0.9, vHalf.x - 0.7, vBox.x));
              if ((bits & 2) != 0) edge = max(edge, smoothstep(vHalf.x - 0.9, vHalf.x - 0.7, -vBox.x));
              if ((bits & 4) != 0) edge = max(edge, smoothstep(vHalf.z - 0.9, vHalf.z - 0.7, vBox.z));
              if ((bits & 8) != 0) edge = max(edge, smoothstep(vHalf.z - 0.9, vHalf.z - 0.7, -vBox.z));
              float speck = fhash(floor(vBox.xz * 2.5));
              diffuseColor.rgb = mix(gravel * (0.9 + 0.2 * speck), wall * 1.08, edge);
            } else {
              diffuseColor.rgb = wall * 0.62;
            }
          } else if (abs(n.y) < 0.5) {
            bool outside = n.x > 0.5 ? (bits & 1) != 0 : n.x < -0.5 ? (bits & 2) != 0 : n.z > 0.5 ? (bits & 4) != 0 : (bits & 8) != 0;
            if (!outside) {
              // Bare concrete, with the line of each floor slab.
              float slab = smoothstep(0.32, 0.22, abs(fract(vBox.y / 4.0 + 0.5) - 0.5) * 4.0);
              diffuseColor.rgb = wall * mix(0.5, 0.36, slab);
            } else {
              float u = abs(n.x) > 0.5 ? vBox.z : vBox.x;
              float hu = abs(n.x) > 0.5 ? vHalf.z : vHalf.x;
              float v = vBox.y;
              float hv = vHalf.y;
              float across = max(1.0, floor(hu * 2.0 / 2.9 + 0.5));
              float rows = max(1.0, floor(hv * 2.0 / 4.0 + 0.5));
              vec2 cell = vec2((u + hu) / (2.0 * hu) * across, (v + hv) / (2.0 * hv) * rows);
              vec2 id = floor(cell);
              vec2 f = fract(cell);
              bool shop = (bits & 32) != 0 && id.y < 0.5;
              vec2 lo = shop ? vec2(0.08, 0.1) : vec2(0.2, 0.26);
              vec2 hi = shop ? vec2(0.92, 0.66) : vec2(0.8, 0.8);
              vec2 aa = fwidth(cell) * 1.2;
              float pane = smoothstep(lo.x - aa.x, lo.x + aa.x, f.x) * smoothstep(hi.x + aa.x, hi.x - aa.x, f.x) *
                smoothstep(lo.y - aa.y, lo.y + aa.y, f.y) * smoothstep(hi.y + aa.y, hi.y - aa.y, f.y);
              // Far away the panes blur into an even tint instead of shimmering.
              float detail = 1.0 - smoothstep(0.25, 0.6, max(aa.x, aa.y));
              pane = mix((hi.x - lo.x) * (hi.y - lo.y), pane, detail);
              float seed = floor(vFace.y + 0.5);
              // (Whole numbers only go into the hash: the least wobble in its input shows up as static.)
              float side = abs(n.x) > 0.5 ? (n.x > 0.0 ? 1.0 : 2.0) : (n.z > 0.0 ? 3.0 : 4.0);
              float r = fhash(id + vec2(seed * 0.37, side * 7.0));
              // Glass: dark, a little bluer and brighter toward the top of each pane, like sky in it.
              float up = clamp((f.y - lo.y) / (hi.y - lo.y), 0.0, 1.0);
              vec3 glass = mix(vec3(0.05, 0.07, 0.1), vec3(0.2, 0.3, 0.42), up * up) * (0.75 + 0.5 * r);
              float on = step(1.0 - uLit * (shop ? 1.4 : 1.0), r);
              vec3 lamp = mix(vec3(1.0, 0.72, 0.38), vec3(0.85, 0.9, 1.0), step(0.8, fract(r * 7.3)));
              vec3 trim = wall;
              if (shop) {
                // An awning stripe over the shop window, a different colour for each shop.
                float awning = smoothstep(0.66, 0.68, f.y) * smoothstep(0.84, 0.82, f.y);
                vec3 cloth = 0.5 + 0.5 * cos(6.2832 * (fhash(vec2(seed, id.x)) + vec3(0.0, 0.33, 0.67)));
                trim = mix(wall * 0.8, mix(cloth, vec3(0.95), step(0.5, fract(f.x * 5.0))) * 0.9, awning);
              } else {
                // A sill under each window, and the storey line between floors.
                trim = wall * (1.0 - 0.14 * smoothstep(0.045, 0.02, abs(f.y - 0.2)) - 0.1 * smoothstep(0.03, 0.0, f.y));
              }
              diffuseColor.rgb = mix(trim, glass, pane);
              windowGlow = lamp * on * pane * (shop ? 0.8 : 1.0) * detail + lamp * on * (1.0 - detail) * 0.3;
            }
          } else {
            diffuseColor.rgb = wall * 0.5;
          }
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        totalEmissiveRadiance += windowGlow * smoothstep(0.0, 0.08, uLit) * (0.3 + 0.8 * uLit);`,
      );
  };
  // One compiled program for every material made here.
  material.customProgramCacheKey = () => 'facade';
  return material;
}
