import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Scene setup with better lighting
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x3a3d5c);
scene.fog = new THREE.Fog(0x3a3d5c, 5, 30);

// Camera
const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    100
);
camera.position.set(0, 2, 7);
camera.lookAt(0, 0, 0);

// Renderer with enhanced settings
const renderer = new THREE.WebGLRenderer({ 
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
document.getElementById('app').appendChild(renderer.domElement);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.maxDistance = 15;
controls.minDistance = 2;

// Enhanced lighting setup for better cloth visibility
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
mainLight.position.set(5, 10, 5);
mainLight.castShadow = true;
mainLight.shadow.mapSize.width = 2048;
mainLight.shadow.mapSize.height = 2048;
mainLight.shadow.camera.near = 0.1;
mainLight.shadow.camera.far = 50;
mainLight.shadow.camera.left = -10;
mainLight.shadow.camera.right = 10;
mainLight.shadow.camera.top = 10;
mainLight.shadow.camera.bottom = -10;
scene.add(mainLight);

// Add rim light for better cloth definition
const rimLight = new THREE.DirectionalLight(0xaabbff, 0.4);
rimLight.position.set(-5, 5, -5);
scene.add(rimLight);

// Add fill light
const fillLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.3);
scene.add(fillLight);

// Ground plane
const groundGeometry = new THREE.PlaneGeometry(20, 20);
const groundMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x1a1d3a,
    roughness: 0.9,
    metalness: 0.1
});
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -3;
ground.receiveShadow = true;
scene.add(ground);

// Pivot Point System
class PivotPointManager {
    constructor() {
        this.pivotPoints = [];
        this.pivotMeshes = [];
        this.selectedPivot = null;
        this.isDragging = false;
        
        // Default pivot points
        this.addPivot(new THREE.Vector3(-2, 2, 0));
        this.addPivot(new THREE.Vector3(2, 2, 0));
        this.addPivot(new THREE.Vector3(0, 2, 0));
    }
    
    addPivot(position) {
        const pivotGeometry = new THREE.SphereGeometry(0.1, 16, 16);
        const pivotMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xffaa00,
            emissive: 0xff6600,
            emissiveIntensity: 0.3,
            metalness: 0.8,
            roughness: 0.2
        });
        
        const pivotMesh = new THREE.Mesh(pivotGeometry, pivotMaterial);
        pivotMesh.position.copy(position);
        pivotMesh.castShadow = true;
        scene.add(pivotMesh);
        
        this.pivotPoints.push(position);
        this.pivotMeshes.push(pivotMesh);
        
        return this.pivotPoints.length - 1;
    }
    
    removePivot(index) {
        if (index >= 0 && index < this.pivotPoints.length) {
            scene.remove(this.pivotMeshes[index]);
            this.pivotPoints.splice(index, 1);
            this.pivotMeshes.splice(index, 1);
        }
    }
    
    updatePivot(index, position) {
        if (index >= 0 && index < this.pivotPoints.length) {
            this.pivotPoints[index].copy(position);
            this.pivotMeshes[index].position.copy(position);
        }
    }
    
    highlightPivot(index) {
        this.pivotMeshes.forEach((mesh, i) => {
            if (i === index) {
                mesh.material.emissiveIntensity = 0.6;
                mesh.scale.setScalar(1.2);
            } else {
                mesh.material.emissiveIntensity = 0.3;
                mesh.scale.setScalar(1.0);
            }
        });
    }
}

// Enhanced Cloth Physics System
class ClothPhysics {
    constructor(width, height, segmentsX, segmentsY, pivotManager) {
        this.width = width;
        this.height = height;
        this.segmentsX = segmentsX;
        this.segmentsY = segmentsY;
        this.pivotManager = pivotManager;
        
        // Physics parameters
        this.params = {
            mass: 0.1,
            damping: 0.02,
            gravity: -9.8,
            windForce: 0.15,
            windFrequency: 1.5,
            stiffness: 0.85,
            bendingStiffness: 0.15,
            tearThreshold: 2.8
        };
        
        this.particles = [];
        this.constraints = [];
        this.cutParticles = new Set();
        this.time = 0;
        
        this.init();
    }
    
    init() {
        this.particles = [];
        this.constraints = [];
        this.cutParticles.clear();
        
        const segmentWidth = this.width / this.segmentsX;
        const segmentHeight = this.height / this.segmentsY;
        
        // Create particles
        for (let y = 0; y <= this.segmentsY; y++) {
            for (let x = 0; x <= this.segmentsX; x++) {
                const particle = {
                    position: new THREE.Vector3(
                        x * segmentWidth - this.width / 2,
                        -y * segmentHeight + this.height / 2,
                        0
                    ),
                    previousPosition: new THREE.Vector3(
                        x * segmentWidth - this.width / 2,
                        -y * segmentHeight + this.height / 2,
                        0
                    ),
                    originalPosition: new THREE.Vector3(
                        x * segmentWidth - this.width / 2,
                        -y * segmentHeight + this.height / 2,
                        0
                    ),
                    velocity: new THREE.Vector3(0, 0, 0),
                    force: new THREE.Vector3(0, 0, 0),
                    mass: this.params.mass,
                    pinned: false,
                    index: y * (this.segmentsX + 1) + x,
                    x: x,
                    y: y,
                    active: true,
                    cutFactor: 1.0  // For organic cutting
                };
                
                this.particles.push(particle);
            }
        }
        
        // Attach particles to pivot points
        this.attachToPivots();
        
        // Create constraints
        this.createConstraints();
    }
    
    attachToPivots() {
        // Clear all pins first
        this.particles.forEach(p => p.pinned = false);
        
        // For each pivot point, find and pin the nearest particle
        this.pivotManager.pivotPoints.forEach(pivotPos => {
            let nearestParticle = null;
            let minDistance = Infinity;
            
            this.particles.forEach(particle => {
                if (particle.y === 0) { // Only consider top row
                    const dist = particle.originalPosition.distanceTo(pivotPos);
                    if (dist < minDistance) {
                        minDistance = dist;
                        nearestParticle = particle;
                    }
                }
            });
            
            if (nearestParticle && minDistance < 0.5) {
                nearestParticle.pinned = true;
                nearestParticle.position.copy(pivotPos);
                nearestParticle.previousPosition.copy(pivotPos);
            }
        });
    }
    
    createConstraints() {
        this.constraints = [];
        
        // Structural constraints
        for (let y = 0; y <= this.segmentsY; y++) {
            for (let x = 0; x <= this.segmentsX; x++) {
                const index = y * (this.segmentsX + 1) + x;
                
                // Horizontal
                if (x < this.segmentsX) {
                    this.addConstraint(index, index + 1, this.params.stiffness);
                }
                
                // Vertical
                if (y < this.segmentsY) {
                    this.addConstraint(index, index + (this.segmentsX + 1), this.params.stiffness);
                }
                
                // Shear (diagonal)
                if (x < this.segmentsX && y < this.segmentsY) {
                    this.addConstraint(index, index + (this.segmentsX + 1) + 1, this.params.stiffness * 0.7);
                    this.addConstraint(index + 1, index + (this.segmentsX + 1), this.params.stiffness * 0.7);
                }
                
                // Bending (skip one)
                if (x < this.segmentsX - 1) {
                    this.addConstraint(index, index + 2, this.params.bendingStiffness);
                }
                if (y < this.segmentsY - 1) {
                    this.addConstraint(index, index + 2 * (this.segmentsX + 1), this.params.bendingStiffness);
                }
            }
        }
    }
    
    addConstraint(index1, index2, stiffness) {
        const p1 = this.particles[index1];
        const p2 = this.particles[index2];
        
        if (!p1 || !p2) return;
        
        const constraint = {
            p1: p1,
            p2: p2,
            restLength: p1.position.distanceTo(p2.position),
            stiffness: stiffness,
            baseStiffness: stiffness,
            active: true
        };
        
        this.constraints.push(constraint);
    }
    
    update(deltaTime) {
        if (deltaTime > 0.02) deltaTime = 0.02;
        
        this.time += deltaTime;
        
        // Update pinned particles to follow pivot points
        this.attachToPivots();
        
        // Apply forces
        for (let particle of this.particles) {
            if (!particle.pinned && particle.active) {
                particle.force.set(0, 0, 0);
                
                // Gravity
                particle.force.y = this.params.gravity * particle.mass;
                
                // Wind with turbulence
                const windX = Math.sin(this.time * this.params.windFrequency) * this.params.windForce;
                const windZ = Math.cos(this.time * this.params.windFrequency * 0.7) * this.params.windForce * 0.5;
                const turbulence = (Math.random() - 0.5) * 0.02;
                
                particle.force.x += windX + turbulence;
                particle.force.z += windZ + turbulence * 0.5;
                
                // Damping
                particle.force.add(
                    particle.velocity.clone().multiplyScalar(-this.params.damping)
                );
            }
        }
        
        // Verlet integration
        for (let particle of this.particles) {
            if (!particle.pinned && particle.active) {
                const temp = particle.position.clone();
                
                particle.position.add(
                    particle.position.clone()
                        .sub(particle.previousPosition)
                        .add(particle.force.clone().multiplyScalar(deltaTime * deltaTime / particle.mass))
                );
                
                particle.previousPosition = temp;
                particle.velocity = particle.position.clone().sub(particle.previousPosition).divideScalar(deltaTime);
            }
        }
        
        // Satisfy constraints multiple times for stability
        for (let i = 0; i < 4; i++) {
            this.satisfyConstraints();
        }
    }
    
    satisfyConstraints() {
        for (let constraint of this.constraints) {
            if (!constraint.active || !constraint.p1.active || !constraint.p2.active) continue;
            
            const p1 = constraint.p1;
            const p2 = constraint.p2;
            
            const diff = p2.position.clone().sub(p1.position);
            const currentLength = diff.length();
            
            if (currentLength > 0) {
                // Apply cut factor for organic tearing
                const tearResistance = Math.min(p1.cutFactor, p2.cutFactor);
                const effectiveTearThreshold = this.params.tearThreshold * tearResistance;
                
                // Check for tearing
                if (currentLength > constraint.restLength * effectiveTearThreshold) {
                    constraint.active = false;
                    continue;
                }
                
                const correction = diff.multiplyScalar(
                    (1 - constraint.restLength / currentLength) * constraint.stiffness
                );
                
                if (!p1.pinned && !p2.pinned) {
                    p1.position.add(correction.clone().multiplyScalar(0.5));
                    p2.position.sub(correction.clone().multiplyScalar(0.5));
                } else if (!p1.pinned) {
                    p1.position.add(correction);
                } else if (!p2.pinned) {
                    p2.position.sub(correction);
                }
            }
        }
    }
    
    // Organic cutting with irregular edges (area-based)
    cutOrganic(center, radius) {
        // Create irregular cut shape
        const angleSteps = 16;
        const cutShape = [];
        
        for (let i = 0; i < angleSteps; i++) {
            const angle = (i / angleSteps) * Math.PI * 2;
            const radiusVariation = radius * (0.7 + Math.random() * 0.6);
            cutShape.push({
                x: center.x + Math.cos(angle) * radiusVariation,
                z: center.z + Math.sin(angle) * radiusVariation
            });
        }
        
        // Apply cut with falloff
        for (let particle of this.particles) {
            const dx = particle.position.x - center.x;
            const dz = particle.position.z - center.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Check if inside irregular shape
            let inside = false;
            for (let i = 0; i < cutShape.length; i++) {
                const j = (i + 1) % cutShape.length;
                const xi = cutShape[i].x - center.x;
                const zi = cutShape[i].z - center.z;
                const xj = cutShape[j].x - center.x;
                const zj = cutShape[j].z - center.z;
                
                const dot = xi * dx + zi * dz;
                const cross = xi * dz - zi * dx;
                
                if (Math.abs(cross) < 0.1 && dot > 0) {
                    inside = true;
                    break;
                }
            }
            
            if (distance < radius * 1.5) {
                if (distance < radius) {
                    // Core cut area
                    particle.active = false;
                    this.cutParticles.add(particle.index);
                } else {
                    // Edge area - weaken for organic tearing
                    const falloff = 1 - (distance - radius) / (radius * 0.5);
                    particle.cutFactor = Math.max(0.2, 1 - falloff);
                    
                    // Add some displacement for irregular edges
                    if (Math.random() > 0.5) {
                        const pushDirection = particle.position.clone().sub(center).normalize();
                        particle.position.add(pushDirection.multiplyScalar(Math.random() * 0.1));
                    }
                }
            }
        }
        
        // Deactivate constraints and weaken using base stiffness (no compounding)
        for (let constraint of this.constraints) {
            if (!constraint.p1.active || !constraint.p2.active) {
                constraint.active = false;
            } else if (constraint.p1.cutFactor < 1 || constraint.p2.cutFactor < 1) {
                const factor = Math.min(constraint.p1.cutFactor, constraint.p2.cutFactor);
                const minFactor = 0.5;
                constraint.stiffness = Math.max(minFactor * constraint.baseStiffness, factor * constraint.baseStiffness);
            } else {
                constraint.stiffness = constraint.baseStiffness;
            }
        }
    }

    // Precise line cutting along a segment with a small radius (capsule around segment)
    cutAlongSegment(start, end, radius) {
        const segDir = end.clone().sub(start);
        const segLen = segDir.length();
        if (segLen < 1e-6) return;
        segDir.divideScalar(segLen);

        // Helper: distance from point to segment
        const distPointToSeg = (point) => {
            const v = end.clone().sub(start);
            const l2 = Math.max(1e-6, v.lengthSq());
            const t = THREE.MathUtils.clamp(point.clone().sub(start).dot(v) / l2, 0, 1);
            const proj = start.clone().addScaledVector(v, t);
            return { d: proj.distanceTo(point), t };
        };

        // 1) Mark particles within capsule
        const shell = radius * 1.6;
        for (let p of this.particles) {
            if (!p.active) continue;
            const { d } = distPointToSeg(p.position);
            if (d <= radius) {
                p.active = false;
                this.cutParticles.add(p.index);
            } else if (d <= shell) {
                const falloff = 1 - (d - radius) / (shell - radius);
                p.cutFactor = Math.min(p.cutFactor, 1 - 0.6 * falloff);
            }
        }

        // 2) Deactivate/soften constraints near the capsule
        for (let constraint of this.constraints) {
            if (!constraint.active) continue;
            const a = constraint.p1.position;
            const b = constraint.p2.position;
            const ab = b.clone().sub(a);
            // closest point on edge to the cutting segment endpoints
            const abLenSq = Math.max(1e-6, ab.lengthSq());
            const t1 = THREE.MathUtils.clamp(start.clone().sub(a).dot(ab) / abLenSq, 0, 1);
            const t2 = THREE.MathUtils.clamp(end.clone().sub(a).dot(ab) / abLenSq, 0, 1);
            const c1 = a.clone().addScaledVector(ab, t1);
            const c2 = a.clone().addScaledVector(ab, t2);
            const d = Math.min(distPointToSeg(c1).d, distPointToSeg(c2).d);
            if (d <= radius || !constraint.p1.active || !constraint.p2.active) {
                constraint.active = false;
                continue;
            }
            const factor = Math.min(constraint.p1.cutFactor, constraint.p2.cutFactor);
            const minFactor = 0.5;
            constraint.stiffness = Math.max(minFactor * constraint.baseStiffness, factor * constraint.baseStiffness);
        }
    }
}

// Enhanced Cloth Mesh
class ClothMesh {
    constructor(physics) {
        this.physics = physics;
        
        this.geometry = new THREE.BufferGeometry();
        
        // Brighter, more visible material (enable vertex colors up front)
        this.material = new THREE.MeshPhysicalMaterial({
            color: 0xaaccff,
            emissive: 0x224488,
            emissiveIntensity: 0.1,
            side: THREE.DoubleSide,
            roughness: 0.6,
            metalness: 0.1,
            clearcoat: 0.4,
            clearcoatRoughness: 0.3,
            transmission: 0.1,
            thickness: 0.5,
            wireframe: false,
            vertexColors: true
        });
        
        // Build geometry after material is ready to avoid undefined access
        this.updateGeometry();
        
        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.castShadow = true;
        this.mesh.receiveShadow = true;
        
        this.needsRebuild = false;
    }
    
    updateGeometry() {
        const vertices = [];
        const indices = [];
        const uvs = [];
        const colors = [];
        
        // Add vertices with color based on cut factor
        for (let particle of this.physics.particles) {
            vertices.push(particle.position.x, particle.position.y, particle.position.z);
            uvs.push(particle.x / this.physics.segmentsX, particle.y / this.physics.segmentsY);
            
            // Color based on damage
            const damage = 1 - particle.cutFactor;
            colors.push(1 - damage * 0.3, 1 - damage * 0.2, 1);
        }
        
        // Create faces with organic cuts
        for (let y = 0; y < this.physics.segmentsY; y++) {
            for (let x = 0; x < this.physics.segmentsX; x++) {
                const a = y * (this.physics.segmentsX + 1) + x;
                const b = a + 1;
                const c = a + (this.physics.segmentsX + 1);
                const d = c + 1;
                
                if (this.physics.particles[a] && this.physics.particles[b] && 
                    this.physics.particles[c] && this.physics.particles[d]) {
                    
                    // Only create faces if all particles are active or mostly intact
                    const avgCutFactor = (
                        this.physics.particles[a].cutFactor +
                        this.physics.particles[b].cutFactor +
                        this.physics.particles[c].cutFactor +
                        this.physics.particles[d].cutFactor
                    ) / 4;
                    
                    if (this.physics.particles[a].active && 
                        this.physics.particles[b].active && 
                        this.physics.particles[c].active && 
                        this.physics.particles[d].active &&
                        avgCutFactor > 0.3) {
                        
                        indices.push(a, b, c);
                        indices.push(b, d, c);
                    }
                }
            }
        }
        
        this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        this.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        this.geometry.setIndex(indices);
        this.geometry.computeVertexNormals();
        this.geometry.attributes.position.needsUpdate = true;
        
        // Enable vertex colors if material exists
        if (this.material) this.material.vertexColors = true;
    }
    
    update() {
        const positions = this.geometry.attributes.position.array;
        const colors = this.geometry.attributes.color.array;
        
        for (let i = 0; i < this.physics.particles.length; i++) {
            const particle = this.physics.particles[i];
            positions[i * 3] = particle.position.x;
            positions[i * 3 + 1] = particle.position.y;
            positions[i * 3 + 2] = particle.position.z;
            
            // Update colors based on damage
            const damage = 1 - particle.cutFactor;
            colors[i * 3] = 1 - damage * 0.3;
            colors[i * 3 + 1] = 1 - damage * 0.2;
            colors[i * 3 + 2] = 1;
        }
        
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.computeVertexNormals();
        
        if (this.needsRebuild) {
            this.updateGeometry();
            this.needsRebuild = false;
        }
    }
    
    markForRebuild() {
        this.needsRebuild = true;
    }
}

// Initialize systems
const pivotManager = new PivotPointManager();
const clothPhysics = new ClothPhysics(5, 5, 30, 30, pivotManager);
const clothMesh = new ClothMesh(clothPhysics);
scene.add(clothMesh.mesh);

// Enhanced Cutting Tool
class CuttingTool {
    constructor() {
        this.active = false;
        this.cutRadius = 0.3;
        
        // Visual indicator with organic shape
        const geometry = new THREE.IcosahedronGeometry(this.cutRadius, 2);
        const material = new THREE.MeshBasicMaterial({
            color: 0xff3333,
            transparent: true,
            opacity: 0.4,
            wireframe: true
        });
        this.indicator = new THREE.Mesh(geometry, material);
        this.indicator.visible = false;
        scene.add(this.indicator);
    }
    
    updatePosition(position) {
        this.indicator.position.copy(position);
        // Rotate for visual effect
        this.indicator.rotation.x += 0.05;
        this.indicator.rotation.y += 0.03;
    }
    
    setActive(active) {
        this.active = active;
        this.indicator.visible = active;
    }
    
    performCut(position) {
        // Fallback single-point cut (kept for key-triggered cuts)
        clothPhysics.cutOrganic(position, this.cutRadius * 0.6);
        clothMesh.markForRebuild();
    }

    performCutSegment(start, end) {
        // Line-based cut for drag strokes
        clothPhysics.cutAlongSegment(start, end, this.cutRadius * 0.6);
        clothMesh.markForRebuild();
    }
    
    updateRadius(radius) {
        this.cutRadius = radius;
        this.indicator.geometry.dispose();
        this.indicator.geometry = new THREE.IcosahedronGeometry(radius, 2);
    }
}

const cuttingTool = new CuttingTool();

// Raycasting and interaction
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let isDraggingPivot = false;
let selectedPivotIndex = -1;
let interactionMode = 'cut'; // 'cut' or 'pivot'
let isCutting = false;
let lastCutPoint = null;

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    
    if (interactionMode === 'pivot' && isDraggingPivot && selectedPivotIndex >= 0) {
        // Drag pivot point
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const intersection = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersection);
        
        pivotManager.updatePivot(selectedPivotIndex, intersection);
        clothPhysics.attachToPivots();
    } else if (interactionMode === 'cut' && (cuttingTool.active || isCutting)) {
        // Update cutting tool position and perform drag cut if active
        const intersects = raycaster.intersectObject(clothMesh.mesh);
        if (intersects.length > 0) {
            const hit = intersects[0].point.clone();
            cuttingTool.updatePosition(hit);
            if (isCutting) {
                const from = lastCutPoint ? lastCutPoint.clone() : hit.clone();
                const to = hit.clone();
                // Perform a single segment cut (no area burst)
                cuttingTool.performCutSegment(from, to);
                lastCutPoint = hit.clone();
            }
        }
    } else if (interactionMode === 'pivot') {
        // Highlight hovered pivot
        const intersects = raycaster.intersectObjects(pivotManager.pivotMeshes);
        if (intersects.length > 0) {
            const index = pivotManager.pivotMeshes.indexOf(intersects[0].object);
            pivotManager.highlightPivot(index);
        } else {
            pivotManager.highlightPivot(-1);
        }
    }
}

function onMouseDown(event) {
    if (event.button === 0) {
        if (interactionMode === 'pivot') {
            // Select pivot for dragging
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(pivotManager.pivotMeshes);
            
            if (intersects.length > 0) {
                selectedPivotIndex = pivotManager.pivotMeshes.indexOf(intersects[0].object);
                isDraggingPivot = true;
                controls.enabled = false;
            } else if (event.altKey) {
                // Add new pivot point
                const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
                const intersection = new THREE.Vector3();
                raycaster.ray.intersectPlane(plane, intersection);
                
                if (intersection.y > 0) {
                    pivotManager.addPivot(intersection);
                    clothPhysics.attachToPivots();
                }
            }
        } else if (interactionMode === 'cut' && event.shiftKey) {
            // Begin drag cutting
            cuttingTool.setActive(true);
            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObject(clothMesh.mesh);
            
            if (intersects.length > 0) {
                const p = intersects[0].point.clone();
                cuttingTool.performCut(p);
                lastCutPoint = p.clone();
                isCutting = true;
                controls.enabled = false;
            }
        }
    } else if (event.button === 2 && interactionMode === 'pivot') {
        // Remove pivot on right click
        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(pivotManager.pivotMeshes);
        
        if (intersects.length > 0) {
            const index = pivotManager.pivotMeshes.indexOf(intersects[0].object);
            pivotManager.removePivot(index);
            clothPhysics.init();
        }
    }
}

function onMouseUp(event) {
    if (event.button === 0) {
        isDraggingPivot = false;
        controls.enabled = true;
        cuttingTool.setActive(false);
        isCutting = false;
        lastCutPoint = null;
    }
}

// Prevent context menu on right click
window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('mousemove', onMouseMove);
window.addEventListener('mousedown', onMouseDown);
window.addEventListener('mouseup', onMouseUp);

// Keyboard controls
window.addEventListener('keydown', (event) => {
    switch(event.key.toLowerCase()) {
        case 'r':
            clothPhysics.init();
            clothMesh.updateGeometry();
            break;
        case 'w':
            clothMesh.material.wireframe = !clothMesh.material.wireframe;
            break;
        case 'c':
            const center = new THREE.Vector3(0, 0, 0);
            clothPhysics.cutOrganic(center, 0.5);
            clothMesh.markForRebuild();
            break;
        case 'd':
            pivotManager.pivotPoints = [];
            pivotManager.pivotMeshes.forEach(mesh => scene.remove(mesh));
            pivotManager.pivotMeshes = [];
            clothPhysics.attachToPivots();
            break;
        case 'p':
            interactionMode = interactionMode === 'pivot' ? 'cut' : 'pivot';
            document.getElementById('mode-indicator').textContent = 
                `Mode: ${interactionMode === 'pivot' ? 'PIVOT EDITING' : 'CUTTING'}`;
            break;
        case '+':
        case '=':
            cuttingTool.updateRadius(Math.min(cuttingTool.cutRadius + 0.1, 1.0));
            break;
        case '-':
        case '_':
            cuttingTool.updateRadius(Math.max(cuttingTool.cutRadius - 0.1, 0.1));
            break;
    }
});

// UI Elements
const infoDiv = document.createElement('div');
infoDiv.style.position = 'absolute';
infoDiv.style.top = '10px';
infoDiv.style.left = '10px';
infoDiv.style.color = '#ffffff';
infoDiv.style.fontFamily = 'system-ui, sans-serif';
infoDiv.style.fontSize = '14px';
infoDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
infoDiv.style.padding = '15px';
infoDiv.style.borderRadius = '8px';
infoDiv.style.backdropFilter = 'blur(10px)';
infoDiv.style.userSelect = 'none';
infoDiv.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
infoDiv.innerHTML = `
    <strong style="color: #aaccff;">🎮 Controls:</strong><br>
    <div style="margin-left: 10px; margin-top: 8px; line-height: 1.6;">
    • Mouse: Rotate camera<br>
    • <strong>Shift + Click</strong>: Cut cloth<br>
    • <strong>P</strong>: Toggle Pivot/Cut mode<br>
    </div>
    <br>
    <strong style="color: #ffaa66;">⚡ Pivot Mode:</strong><br>
    <div style="margin-left: 10px; margin-top: 8px; line-height: 1.6;">
    • Click & Drag: Move pivot points<br>
    • <strong>Alt + Click</strong>: Add new pivot<br>
    • Right Click: Remove pivot<br>
    </div>
    <br>
    <strong style="color: #66ff99;">⌨️ Keyboard:</strong><br>
    <div style="margin-left: 10px; margin-top: 8px; line-height: 1.6;">
    • R: Reset cloth<br>
    • W: Toggle wireframe<br>
    • C: Cut center hole<br>
    • D: Drop cloth (remove pivots)<br>
    • +/-: Adjust cut size<br>
    </div>
`;
document.body.appendChild(infoDiv);

// Mode indicator
const modeDiv = document.createElement('div');
modeDiv.id = 'mode-indicator';
modeDiv.style.position = 'absolute';
modeDiv.style.top = '10px';
modeDiv.style.left = '50%';
modeDiv.style.transform = 'translateX(-50%)';
modeDiv.style.color = '#ffffff';
modeDiv.style.fontFamily = 'system-ui, sans-serif';
modeDiv.style.fontSize = '18px';
modeDiv.style.fontWeight = 'bold';
modeDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
modeDiv.style.padding = '10px 20px';
modeDiv.style.borderRadius = '20px';
modeDiv.style.backdropFilter = 'blur(10px)';
modeDiv.style.boxShadow = '0 4px 6px rgba(0,0,0,0.3)';
modeDiv.textContent = 'Mode: CUTTING';
document.body.appendChild(modeDiv);

// FPS counter
const stats = {
    fps: 0,
    frameCount: 0,
    lastTime: performance.now()
};

const fpsDiv = document.createElement('div');
fpsDiv.style.position = 'absolute';
fpsDiv.style.top = '10px';
fpsDiv.style.right = '10px';
fpsDiv.style.color = '#00ff88';
fpsDiv.style.fontFamily = 'monospace';
fpsDiv.style.fontSize = '16px';
fpsDiv.style.fontWeight = 'bold';
fpsDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
fpsDiv.style.padding = '8px 12px';
fpsDiv.style.borderRadius = '4px';
fpsDiv.style.backdropFilter = 'blur(5px)';
document.body.appendChild(fpsDiv);

// Window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize);

// Animation loop
const clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    const deltaTime = clock.getDelta();
    
    // Update physics
    clothPhysics.update(deltaTime);
    
    // Update mesh
    clothMesh.update();
    
    // Update controls
    controls.update();
    
    // Animate cutting tool
    if (cuttingTool.active) {
        cuttingTool.indicator.rotation.x += 0.05;
        cuttingTool.indicator.rotation.y += 0.03;
    }
    
    // Update FPS
    stats.frameCount++;
    const currentTime = performance.now();
    if (currentTime >= stats.lastTime + 1000) {
        stats.fps = Math.round((stats.frameCount * 1000) / (currentTime - stats.lastTime));
        fpsDiv.textContent = `FPS: ${stats.fps}`;
        stats.frameCount = 0;
        stats.lastTime = currentTime;
    }
    
    // Render
    renderer.render(scene, camera);
}

// Start animation
animate();

console.log('Enhanced Cloth Simulation Initialized!');
console.log('Press P to toggle between Pivot and Cutting modes');