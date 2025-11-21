// Basic cloth physics using Verlet integration and distance constraints.
import * as THREE from 'three';

export class Particle {
  constructor(x, y, z, mass = 1) {
    this.position = new THREE.Vector3(x, y, z);
    this.previous = new THREE.Vector3(x, y, z);
    this.acceleration = new THREE.Vector3();
    this.inverseMass = mass > 0 ? 1 / mass : 0;
    this.pinned = false;
    this.pinPosition = new THREE.Vector3();
  }

  addForce(force) {
    if (this.inverseMass === 0) return;
    this.acceleration.addScaledVector(force, this.inverseMass);
  }

  integrate(deltaTime, damping) {
    if (this.pinned) {
      this.position.copy(this.pinPosition);
      this.previous.copy(this.pinPosition);
      this.acceleration.set(0, 0, 0);
      return;
    }
    const temp = this.position.clone();
    
    // Improved Verlet integration with better damping
    const velocity = this.position.clone().sub(this.previous);
    const dampingFactor = 1 - damping;
    
    // Apply velocity damping (don't mutate original)
    const dampedVelocity = velocity.multiplyScalar(dampingFactor);
    
    // Verlet step with smoother acceleration
    this.position.add(dampedVelocity).addScaledVector(this.acceleration, deltaTime * deltaTime);
    this.previous.copy(temp);
    this.acceleration.set(0, 0, 0);
  }

  pinToCurrent() {
    this.pinned = true;
    this.pinPosition.copy(this.position);
  }

  unpin() {
    this.pinned = false;
  }
}

export class Constraint {
  constructor(p1, p2, restDistance, stiffness = 1.0) {
    this.p1 = p1;
    this.p2 = p2;
    this.restDistance = restDistance;
    this.stiffness = stiffness; // 1.0 = full stiffness, lower = softer
    this.broken = false;
  }

  satisfy() {
    if (this.broken) return;
    const delta = this.p2.position.clone().sub(this.p1.position);
    const currentDist = delta.length();
    if (currentDist === 0) return;
    
    // Use relaxation factor with stiffness for smoother constraint satisfaction
    // Lower relaxation = smoother, more gradual adjustments
    // Stiffness affects how strongly the constraint is enforced
    const relaxation = 0.25 * this.stiffness;
    const diff = (currentDist - this.restDistance) / currentDist * relaxation;

    const inv1 = this.p1.pinned ? 0 : this.p1.inverseMass;
    const inv2 = this.p2.pinned ? 0 : this.p2.inverseMass;
    const sumInv = inv1 + inv2;
    if (sumInv === 0) return;

    const move1 = (inv1 / sumInv) * diff;
    const move2 = (inv2 / sumInv) * diff;

    this.p1.position.addScaledVector(delta, move1);
    this.p2.position.addScaledVector(delta, -move2);
  }
}

export class Cloth {
  constructor({ width = 10, height = 6, segmentsX = 30, segmentsY = 18, gravity = -9.81, damping = 0.02, iterations = 5, tearFactor = 1.75 }) {
    this.width = width;
    this.height = height;
    this.segmentsX = segmentsX;
    this.segmentsY = segmentsY;
    this.gravity = new THREE.Vector3(0, gravity, 0);
    this.damping = damping;
    this.iterations = iterations;
    this.tearFactor = tearFactor;

    this.particles = [];
    this.constraints = [];
    this.physicsEnabled = false; // Physics only starts when 'S' is pressed

    this._buildGrid();
  }

  _idx(x, y) {
    return y * (this.segmentsX + 1) + x;
  }

  _buildGrid() {
    const dx = this.width / this.segmentsX;
    const dy = this.height / this.segmentsY;
    const offsetX = -this.width / 2;
    const offsetY = 4; // top row at y=4 (moved up)

    for (let y = 0; y <= this.segmentsY; y++) {
      for (let x = 0; x <= this.segmentsX; x++) {
        const px = offsetX + x * dx;
        const py = offsetY - y * dy;
        const pz = 0;
        const particle = new Particle(px, py, pz, 1);
        this.particles.push(particle);
      }
    }
    
    // Pin all non-top-row particles to keep cloth fixed initially
    // Top-row particles start unpinned so they can be selected as constraint points
    const topRowIndices = this.topRowIndices();
    for (let i = 0; i < this.particles.length; i++) {
      if (!topRowIndices.includes(i)) {
        this.particles[i].pinToCurrent();
      }
    }

    const restX = dx;
    const restY = dy;
    const diag = Math.hypot(dx, dy);

    const addC = (i1, i2, r, stiffness = 1.0) => this.constraints.push(new Constraint(this.particles[i1], this.particles[i2], r, stiffness));

    // Structural constraints (direct neighbors) - full stiffness
    for (let y = 0; y <= this.segmentsY; y++) {
      for (let x = 0; x <= this.segmentsX; x++) {
        if (x < this.segmentsX) addC(this._idx(x, y), this._idx(x + 1, y), restX, 1.0); // structural X
        if (y < this.segmentsY) addC(this._idx(x, y), this._idx(x, y + 1), restY, 1.0); // structural Y
        if (x < this.segmentsX && y < this.segmentsY) {
          addC(this._idx(x, y), this._idx(x + 1, y + 1), diag, 1.0); // shear
          addC(this._idx(x + 1, y), this._idx(x, y + 1), diag, 1.0); // shear
        }
      }
    }
    
    // Bending constraints (skip one segment) - only vertical to allow natural downward sagging
    // Horizontal bending constraints removed to prevent curved trough formation
    const bendingRestY = restY * 2;
    const bendingStiffness = 0.4; // Softer to allow natural sagging downward
    
    // Only add vertical bending constraints to allow natural downward sagging
    for (let y = 0; y <= this.segmentsY; y++) {
      for (let x = 0; x <= this.segmentsX; x++) {
        if (y < this.segmentsY - 1) {
          addC(this._idx(x, y), this._idx(x, y + 2), bendingRestY, bendingStiffness); // bending Y only
        }
      }
    }
    
    // Remove initial randomness to allow natural sagging instead of curves
  }

  topRowIndices() {
    const arr = [];
    for (let x = 0; x <= this.segmentsX; x++) arr.push(this._idx(x, 0));
    return arr;
  }

  step(deltaTime) {
    // Only apply physics if simulation has been started
    if (!this.physicsEnabled) {
      return;
    }

    // Forces
    for (const p of this.particles) p.addForce(this.gravity);

    // Integrate
    for (const p of this.particles) p.integrate(deltaTime, this.damping);

    // Satisfy constraints multiple iterations
    // Alternate constraint processing order for smoother convergence
    for (let i = 0; i < this.iterations; i++) {
      const reverse = i % 2 === 1;
      if (reverse) {
        // Process constraints in reverse order every other iteration
        for (let j = this.constraints.length - 1; j >= 0; j--) {
          const c = this.constraints[j];
          if (c.broken) continue;
          // optional tearing by over-stretch
          const currentDist = c.p2.position.distanceTo(c.p1.position);
          if (currentDist > c.restDistance * this.tearFactor) {
            c.broken = true;
            continue;
          }
          c.satisfy();
        }
      } else {
        // Process constraints in forward order
        for (const c of this.constraints) {
          if (c.broken) continue;
          // optional tearing by over-stretch
          const currentDist = c.p2.position.distanceTo(c.p1.position);
          if (currentDist > c.restDistance * this.tearFactor) {
            c.broken = true;
            continue;
          }
          c.satisfy();
        }
      }
    }
  }

  togglePin(index) {
    const p = this.particles[index];
    if (!p) return false;
    
    // Only allow toggling top-row points as constraint points
    const topRowIndices = this.topRowIndices();
    if (!topRowIndices.includes(index)) return false;
    
    // Don't allow toggling if simulation has already started
    if (this.physicsEnabled) return false;
    
    // Toggle pin state (just selects/deselects constraint point)
    if (p.pinned) {
      p.unpin();
    } else {
      p.pinToCurrent();
    }
    
    // Relax the cloth around constraint points for smoother appearance
    this.relaxConstraints();
    
    return p.pinned;
  }

  relaxConstraints() {
    // Apply constraint satisfaction without physics to relax the cloth smoothly
    for (let i = 0; i < 12; i++) { // more iterations for smoother cloth
      for (let j = 0; j < this.constraints.length; j++) {
        const c = this.constraints[j];
        if (c.broken) continue;
        c.satisfy();
      }
      // Extra: update secondary sag between anchors for true cloth-effect
      if (!this.physicsEnabled) {
        this.applyPreSagOnTopRow(3); // 3 internal repeats for soft draping
      }
    }
    // Also, apply one more pass to catch any missed adjustments
    if (!this.physicsEnabled) {
      this.applyPreSagOnTopRow(5); // repeat several times for max softness
    }
  }

  startSimulation() {
    // Check if any constraint points are selected
    const topRowIndices = this.topRowIndices();
    const hasConstraintPoints = topRowIndices.some(idx => this.particles[idx].pinned);
    
    if (!hasConstraintPoints) {
      return false; // No constraint points selected
    }
    
    // Extensive relaxation before starting simulation for smooth, natural drape
    // This creates the smooth, relaxed appearance seen in the reference
    // With fewer points, need more iterations to achieve natural drape
    // Reduced iterations to prevent excessive draping while maintaining smooth bending
    for (let i = 0; i < 12; i++) {
      for (const c of this.constraints) {
        if (c.broken) continue;
        c.satisfy();
      }
    }
    
    // Apply one more shaping pass to ensure clear sag between anchors at start
    this.applyPreSagOnTopRow();

    // Enable physics
    this.physicsEnabled = true;
    
    // Unpin all particles that are not top-row constraint points
    for (let i = 0; i < this.particles.length; i++) {
      if (!topRowIndices.includes(i)) {
        this.particles[i].unpin();
      }
    }
    
    return true;
  }

  // Screen-space cutting helper: given a function that returns true for a constraint to break
  breakConstraints(predicate) {
    let count = 0;
    for (const c of this.constraints) {
      if (!c.broken && predicate(c)) {
        c.broken = true;
        count++;
      }
    }
    return count;
  }

  // Compute stronger sag between selected top-row anchors.
  // Move only the unpinned top-row particles between pinned anchors along a deeper parabola.
  applyPreSagOnTopRow(repeat = 1) {
    const top = this.topRowIndices();
    const pinnedCols = [];
    for (let i = 0; i < top.length; i++) {
      if (this.particles[top[i]].pinned) pinnedCols.push(i);
    }
    if (pinnedCols.length < 2) return; // need at least two anchors

    const dx = this.width / this.segmentsX;

    for (let r = 0; r < repeat; r++) {
      for (let a = 0; a < pinnedCols.length - 1; a++) {
        const leftCol = pinnedCols[a];
        const rightCol = pinnedCols[a + 1];
        const spanCols = rightCol - leftCol;
        if (spanCols <= 1) continue;

        const spanWidth = spanCols * dx;
        const maxSag = spanWidth * 0.55; // much deeper droop for clothy look

        const leftIdx = top[leftCol];
        const rightIdx = top[rightCol];
        const yLeft = this.particles[leftIdx].position.y;
        const yRight = this.particles[rightIdx].position.y;
        const yBaseline = Math.min(yLeft, yRight);

        for (let col = leftCol + 1; col < rightCol; col++) {
          const t = (col - leftCol) / spanCols;
          // Parabolic dip peaking at middle: 4t(1-t)
          const dip = maxSag * (4 * t * (1 - t));
          const idx = top[col];
          const p = this.particles[idx];
          if (p.pinned) continue;
          const targetY = yBaseline - dip;
          // Stronger blend for dramatically visible dip
          p.position.y = p.position.y * 0.2 + targetY * 0.8;
          p.previous.y = p.position.y;
        }
      }
    }
  }
}


