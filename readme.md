
## Dynamic Mesh Manipulation (Three.js)

An interactive cloth simulation playground built with Three.js and Vite. It showcases real-time cutting, tearing, and pivot manipulation over a richly lit scene for prototyping soft-body interactions such as fabric tailoring, rigging, or VFX concepts.

---

- Custom cloth physics powered by Verlet integration, structural/shear/bend constraints, and organic tearing thresholds.
- Drag-to-cut tool with spherical and segment-based carving for both precise slices and organic perforations.
- Pivot management system (add/move/remove) that pins cloth vertices to arbitrary anchor points.
- Cinematic lighting setup (ambient, directional, rim, hemisphere) with tone mapping, fog, and ground plane for depth cues.
- Diegetic HUD overlay describing controls, FPS counter, and live mode indicator that keeps the UI minimal yet informative.

---

### 🗂 Project Structure
```
.
├── assets/
│   └── rug/scene.*              # Example GLTF assets (not currently imported)
├── src/
│   ├── main.js                  # Three.js scene, physics, controls, UI
│   ├── script.js                # (Legacy/experimental) keep if needed
│   ├── cloth.js                 # (Reference physics experiments)
│   ├── index.html               # Vite entry markup
│   └── style.css                # Global styles
├── static/                      # Reserved for future static assets
├── index.html                   # Legacy root (if serving without Vite)
├── package.json
├── vite.config.js
└── readme.md
```

Only `src/main.js` is required for the current experience; the other scripts are left intact for experimentation.

---

### 🚀 Getting Started
1. **Install prerequisites**
   - [Node.js 18+](https://nodejs.org/en/download/) (bundles npm)
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Start the dev server**
   ```bash
   npm run dev
   ```
   Vite opens the app at the printed localhost URL (default `http://localhost:5173`). Hot Module Replacement keeps edits instant.

4. **Build for production**
   ```bash
   npm run build
   npm run preview   # optional sanity check of the build
   ```
   Output lands in `dist/` and can be deployed to any static host.

---

### 🎮 Interaction Guide
- **Camera:** OrbitControls (drag to orbit, wheel to zoom, right-drag to pan)
- **Cutting mode (default)**  
  - `Shift + Left-Drag` → draw a slicing path (segment-based cut)  
  - `Shift + Left-Click` → burst cut at cursor (spherical)  
  - `+ / -` → grow/shrink cutter radius  
  - `C` → punch a centered hole
- **Pivot mode (`P` to toggle)**
  - `Click + Drag` pivot spheres to reposition pinned vertices
  - `Alt + Click` anywhere above cloth plane to spawn a pivot
  - `Right-Click` pivot sphere to delete
  - `D` → drop cloth by removing every pivot
- **Visual toggles**
  - `W` → wireframe view  
  - `R` → reset cloth to pristine state

HUD panels (top-left/right) mirror these controls and display the live FPS so the experience is self-documenting during demos.

---

### 🧠 Implementation Notes
- **ClothPhysics**: Generates a `(segmentsX+1) x (segmentsY+1)` particle grid, pins top-row vertices nearest to pivot meshes, and applies gravity, wind gusts, damping, and constraint solving (structural/shear/bending). Cutting marks particles inactive or weakens their `cutFactor`, which downstream softens/tears constraints.
- **CuttingTool**: Maintains a rotating Icosahedron indicator and exposes `performCut`, `performCutSegment`, and `updateRadius`, so you can script alternative interactions (e.g., VR controllers) without touching the physics core.
- **ClothMesh**: BufferGeometry with vertex colors tied to particle damage. Rebuilds itself when topology changes significantly (after cuts) to keep normals coherent.
- **Scene polish**: ACES tone mapping, volumetric fog, high-res shadow maps, and rim/fill lighting make the cloth edges readable even after aggressive tearing.

---

### 🧪 Extending the Sandbox
- **Import your own fabric textures** via `MeshPhysicalMaterial` maps or by sampling `assets/rug` and piping a texture loader.
- **Swap physics params** (`mass`, `damping`, `stiffness`, `tearThreshold`, etc.) to simulate different textiles.
- **Persist pivot presets** by serializing `PivotPointManager.pivotPoints` and restoring them from UI controls.
- **Expose UI sliders** (wind, gravity, cut radius) with a lightweight control panel such as Leva or dat.GUI.

---

### 🐞 Troubleshooting
- Blank screen? Ensure the `#app` container from `src/index.html` exists after editing layout files.
- Performance drops after heavy cuts? Call `R` to reset or reduce `segmentsX/Y` when instantiating `ClothPhysics`.
- Pivot doesn’t grab? Only top-edge particles (row `y === 0`) can be pinned; try lowering the pivot or increasing cloth height to widen selection.

---

### 📄 License
Specify your preferred license (e.g., MIT) if you plan to open-source this repo. Add a `LICENSE` file so GitHub renders it automatically.

---

### 🙌 Acknowledgements
Built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). Inspired by classic cloth demos from the Three.js community and adapted for dynamic cutting experiments.
