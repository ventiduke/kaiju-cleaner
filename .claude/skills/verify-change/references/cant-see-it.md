# "It should be there, but I can't see it"

Things that fail in three.js with no error. Check them in this order; each takes a line in the browser
console or in a `scripts/shots.mjs` snippet (`g` is `window.__game`).

1. **Is it in the scene?** `g.sim.scene.getObjectByName(...)`, or traverse and count. Systems add their
   meshes in their constructor: was the system created for this scene (`src/scenes/city.ts`, `populate`)?
2. **Visible, and every parent visible?** Walk `.parent` up to the scene.
3. **Where is it?** `getWorldPosition`. Things at the origin, under the ground (y < 0), or thousands of
   metres away are the usual finds. The ground is y = 0; the river bed is at minus the river depth.
4. **Scale.** A zero or NaN scale draws nothing. Instanced things are hidden here by scaling to zero.
5. **InstancedMesh `count`.** It starts at 0 for pooled effects and must be raised; `instanceMatrix.needsUpdate`
   must be set after writing; `frustumCulled = false` unless the bounding sphere is kept up to date.
6. **Camera range.** Near plane 1, far plane 9000. The sky and hills are drawn far out on purpose.
7. **Material.** `transparent` with `opacity` 0; `side` (a plane seen from behind); `depthWrite`/`depthTest`
   and `renderOrder` for see-through things; `colorWrite`. The kaiju's see-through outline uses the stencil
   buffer: a new render target needs `stencilBuffer: true`.
8. **Lit at all?** Lambert materials are black without light. At night the sun is the moon and weak: check
   at `h.hour(13)` before deciding a thing is missing.
9. **Fog.** Custom shaders must include the fog chunks or set `fog: false`; otherwise they pop against the haze.
10. **Shadows.** The sun's shadow box follows the kaiju and covers about 200 m each way: nothing beyond it
    casts or takes a shadow. That is by design.
11. **Colour.** Custom shaders must end with `#include <tonemapping_fragment>` and
    `#include <colorspace_fragment>`, or they come out dark and dull next to everything else.
12. **Shader hashes.** Anything fed to a hash in a shader must be a whole number or rounded: an
    interpolated value that is "the same everywhere" still wobbles in its last bit and shows up as static
    (this happened to the lit windows).
13. **The HUD is DOM, not WebGL.** If a HUD element is missing, look at `index.html` styles and
    `body.dev-off` / `body.help-off`: the tuning panel and help are hidden until ` and H.
