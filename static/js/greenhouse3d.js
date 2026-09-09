/**
 * LokaGrow 3D Digital Twin (Three.js + GSAP)
 * Interactive 3D Greenhouse with physical zones, day/night cycles,
 * tactile fan rotation, grow lights, misting particles, and Picture-in-Picture (PiP).
 */

class Greenhouse3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) {
            console.error(`[Greenhouse3D] Container #${containerId} not found`);
            return;
        }

        // Three.js Core
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.clock = new THREE.Clock();

        // 3D Objects & Actuators
        this.fanBlades = [];
        this.growLights = [];
        this.growLightMeshes = [];
        this.mistingParticles = null;
        this.mistActive = false;
        this.fanSpeed = 0;
        this.targetFanSpeed = 0;
        this.masterLed = null;

        // Celestial & Sky
        this.sunLight = null;
        this.sunSphere = null;
        this.ambientLight = null;
        this.hemiLight = null;
        this.starField = null;

        // Zones
        this.zones = {
            penyemaian: null,
            peremajaan: null,
            dewasa: null
        };
        this.activeZoneFocus = null;

        // Interaction & Raycasting
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.interactiveMeshes = [];

        // PiP State
        this.pipState = 'embedded'; // 'embedded', 'fullscreen', 'pip'

        // Initialize
        this.init();
    }

    init() {
        this.setupScene();
        this.setupLighting();
        this.buildEnvironment();
        this.buildGreenhouseArchitecture();
        this.buildPlantZones();
        this.buildActuators();
        this.setupEventListeners();
        this.bindSimEngine();
        this.animate();

        console.log('🌿 [Greenhouse3D] Digital Twin initialized successfully.');
    }

    setupScene() {
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x87ceeb);
        this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.015);

        // Camera
        const rect = this.container.getBoundingClientRect();
        const aspect = (rect.width || 800) / (rect.height || 500);
        this.camera = new THREE.PerspectiveCamera(45, aspect, 0.5, 300);
        this.camera.position.set(16, 12, 22);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(rect.width || 800, rect.height || 500);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        this.container.appendChild(this.renderer.domElement);

        // OrbitControls
        if (typeof THREE.OrbitControls !== 'undefined') {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.05;
            this.controls.maxPolarAngle = Math.PI / 2 - 0.02; // Don't go below ground
            this.controls.minDistance = 5;
            this.controls.maxDistance = 50;
            this.controls.target.set(0, 2, 0);
        }

        // Auto-resize observer
        this.resizeObserver = new ResizeObserver(() => this.onResize());
        this.resizeObserver.observe(this.container);
    }

    setupLighting() {
        // Hemisphere ambient light (sky/ground)
        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x3d5a45, 0.6);
        this.hemiLight.position.set(0, 50, 0);
        this.scene.add(this.hemiLight);

        // Ambient fill
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
        this.scene.add(this.ambientLight);

        // Sun Directional Light with Shadows
        this.sunLight = new THREE.DirectionalLight(0xfff5e6, 1.4);
        this.sunLight.position.set(20, 30, 20);
        this.sunLight.castShadow = true;
        this.sunLight.shadow.mapSize.width = 2048;
        this.sunLight.shadow.mapSize.height = 2048;
        this.sunLight.shadow.camera.near = 0.5;
        this.sunLight.shadow.camera.far = 100;
        const d = 18;
        this.sunLight.shadow.camera.left = -d;
        this.sunLight.shadow.camera.right = d;
        this.sunLight.shadow.camera.top = d;
        this.sunLight.shadow.camera.bottom = -d;
        this.sunLight.shadow.bias = -0.0005;
        this.scene.add(this.sunLight);

        // Visible Sun Disc
        const sunGeo = new THREE.SphereGeometry(1.5, 16, 16);
        const sunMat = new THREE.MeshBasicMaterial({ color: 0xffe87c });
        this.sunSphere = new THREE.Mesh(sunGeo, sunMat);
        this.scene.add(this.sunSphere);
    }

    buildEnvironment() {
        // Outer Ground Lawn
        const groundGeo = new THREE.PlaneGeometry(120, 120);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x2d4f38,
            roughness: 0.9,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.05;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Greenhouse Concrete Foundation Slab
        const slabGeo = new THREE.BoxGeometry(11, 0.2, 17);
        const slabMat = new THREE.MeshStandardMaterial({
            color: 0x9ca3af,
            roughness: 0.8
        });
        const slab = new THREE.Mesh(slabGeo, slabMat);
        slab.position.set(0, 0.1, 0);
        slab.receiveShadow = true;
        this.scene.add(slab);

        // Interior Concrete Aisle Path
        const pathGeo = new THREE.BoxGeometry(2.0, 0.05, 16);
        const pathMat = new THREE.MeshStandardMaterial({
            color: 0xd1d5db,
            roughness: 0.7
        });
        const path = new THREE.Mesh(pathGeo, pathMat);
        path.position.set(0, 0.22, 0);
        path.receiveShadow = true;
        this.scene.add(path);

        // Night Starfield
        const starGeo = new THREE.BufferGeometry();
        const starCount = 800;
        const starPositions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount * 3; i += 3) {
            starPositions[i] = (Math.random() - 0.5) * 160;
            starPositions[i + 1] = Math.random() * 60 + 15;
            starPositions[i + 2] = (Math.random() - 0.5) * 160;
        }
        starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        const starMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.8,
            transparent: true,
            opacity: 0.0 // starts invisible in daylight
        });
        this.starField = new THREE.Points(starGeo, starMat);
        this.scene.add(this.starField);
    }

    buildGreenhouseArchitecture() {
        const ghGroup = new THREE.Group();
        const W = 10;   // width (X)
        const L = 16;   // length (Z)
        const H_wall = 3.0; // wall height
        const H_roof = 4.8; // roof peak

        const aluminumMat = new THREE.MeshStandardMaterial({
            color: 0x64748b,
            metalness: 0.8,
            roughness: 0.25
        });

        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xdbeafe,
            transparent: true,
            opacity: 0.35,
            roughness: 0.1,
            metalness: 0.1,
            clearcoat: 1.0,
            clearcoatRoughness: 0.1
        });

        // Helper: Create Aluminum Pillar/Beam
        const createBeam = (w, h, d, x, y, z) => {
            const geo = new THREE.BoxGeometry(w, h, d);
            const mesh = new THREE.Mesh(geo, aluminumMat);
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            ghGroup.add(mesh);
            return mesh;
        };

        const postR = 0.12;

        // 4 Corner Pillars
        createBeam(postR, H_wall, postR, -W / 2, H_wall / 2, -L / 2);
        createBeam(postR, H_wall, postR, W / 2, H_wall / 2, -L / 2);
        createBeam(postR, H_wall, postR, -W / 2, H_wall / 2, L / 2);
        createBeam(postR, H_wall, postR, W / 2, H_wall / 2, L / 2);

        // Intermediate Wall Posts along Z
        const zSpans = [-L / 4, 0, L / 4];
        zSpans.forEach(z => {
            createBeam(postR, H_wall, postR, -W / 2, H_wall / 2, z);
            createBeam(postR, H_wall, postR, W / 2, H_wall / 2, z);
        });

        // Horizontal Wall Top Plates
        createBeam(postR, postR, L, -W / 2, H_wall, 0);
        createBeam(postR, postR, L, W / 2, H_wall, 0);

        // End Wall Top Gables
        createBeam(W, postR, postR, 0, H_wall, -L / 2);
        createBeam(W, postR, postR, 0, H_wall, L / 2);

        // Central Roof Ridge Beam
        createBeam(postR, postR, L, 0, H_roof, 0);

        // Triangular Gable Trusses
        [ -L / 2, -L / 4, 0, L / 4, L / 2 ].forEach(z => {
            // Rafter Left
            const rafterGeo = new THREE.CylinderGeometry(0.06, 0.06, Math.hypot(W / 2, H_roof - H_wall));
            const rafterL = new THREE.Mesh(rafterGeo, aluminumMat);
            rafterL.position.set(-W / 4, (H_wall + H_roof) / 2, z);
            rafterL.rotation.z = -Math.atan2(H_roof - H_wall, W / 2);
            ghGroup.add(rafterL);

            // Rafter Right
            const rafterR = new THREE.Mesh(rafterGeo, aluminumMat);
            rafterR.position.set(W / 4, (H_wall + H_roof) / 2, z);
            rafterR.rotation.z = Math.atan2(H_roof - H_wall, W / 2);
            ghGroup.add(rafterR);
        });

        // Glass Panels: Walls
        const sideWallGeo = new THREE.PlaneGeometry(L, H_wall);
        // Left wall
        const wallL = new THREE.Mesh(sideWallGeo, glassMat);
        wallL.rotation.y = Math.PI / 2;
        wallL.position.set(-W / 2, H_wall / 2, 0);
        ghGroup.add(wallL);
        // Right wall
        const wallR = new THREE.Mesh(sideWallGeo, glassMat);
        wallR.rotation.y = -Math.PI / 2;
        wallR.position.set(W / 2, H_wall / 2, 0);
        ghGroup.add(wallR);

        // Front wall (with door gap)
        const frontWallGeo = new THREE.PlaneGeometry(W, H_wall);
        const wallFront = new THREE.Mesh(frontWallGeo, glassMat);
        wallFront.position.set(0, H_wall / 2, L / 2);
        ghGroup.add(wallFront);

        // Back wall
        const wallBack = new THREE.Mesh(frontWallGeo, glassMat);
        wallBack.rotation.y = Math.PI;
        wallBack.position.set(0, H_wall / 2, -L / 2);
        ghGroup.add(wallBack);

        // Roof Glass Panels
        const roofPitch = Math.atan2(H_roof - H_wall, W / 2);
        const roofSlopeWidth = Math.hypot(W / 2, H_roof - H_wall);
        const roofPanelGeo = new THREE.PlaneGeometry(roofSlopeWidth, L);

        // Left Roof Slope
        const roofL = new THREE.Mesh(roofPanelGeo, glassMat);
        roofL.position.set(-W / 4, (H_wall + H_roof) / 2, 0);
        roofL.rotation.x = Math.PI / 2;
        roofL.rotation.y = -roofPitch;
        ghGroup.add(roofL);

        // Right Roof Slope
        const roofR = new THREE.Mesh(roofPanelGeo, glassMat);
        roofR.position.set(W / 4, (H_wall + H_roof) / 2, 0);
        roofR.rotation.x = Math.PI / 2;
        roofR.rotation.y = roofPitch;
        ghGroup.add(roofR);

        this.scene.add(ghGroup);
    }

    buildPlantZones() {
        // --- ZONE 1: PENYEMAIAN (Seeding / Nursery) [Front-Left: Z = +4.5, X = -2.8] ---
        const zone1Group = new THREE.Group();
        zone1Group.name = 'penyemaian';

        // Multi-tier nursery bench table
        const tableGeo = new THREE.BoxGeometry(2.4, 0.8, 5.5);
        const tableMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
        const table1 = new THREE.Mesh(tableGeo, tableMat);
        table1.position.set(-2.8, 0.4, 4.5);
        table1.castShadow = true;
        table1.receiveShadow = true;
        zone1Group.add(table1);

        // Seedling Trays & Microgreens
        const sproutMat = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.4 });
        const soilMat = new THREE.MeshStandardMaterial({ color: 0x271c19, roughness: 0.9 });
        for (let row = -2.2; row <= 2.2; row += 0.9) {
            // Seedling Tray
            const tray = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.08, 0.75), soilMat);
            tray.position.set(-2.8, 0.84, 4.5 + row);
            tray.castShadow = true;
            zone1Group.add(tray);

            // Sprout clusters
            for (let sx = -0.8; sx <= 0.8; sx += 0.4) {
                const sprout = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 5), sproutMat);
                sprout.position.set(-2.8 + sx, 0.95, 4.5 + row);
                zone1Group.add(sprout);
            }
        }

        // Zone 1 Beacon / Indicator Ring
        const ringGeo = new THREE.RingGeometry(0.8, 0.95, 24);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide });
        const beacon1 = new THREE.Mesh(ringGeo, ringMat);
        beacon1.rotation.x = -Math.PI / 2;
        beacon1.position.set(-2.8, 0.86, 4.5);
        zone1Group.add(beacon1);

        // Click hit box
        const hitBox1 = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.5, 6.0), new THREE.MeshBasicMaterial({ visible: false }));
        hitBox1.position.set(-2.8, 1.25, 4.5);
        hitBox1.userData = { zone: 'penyemaian', name: 'Node 1: Penyemaian (Seeding)' };
        zone1Group.add(hitBox1);
        this.interactiveMeshes.push(hitBox1);

        this.zones.penyemaian = zone1Group;
        this.scene.add(zone1Group);

        // --- ZONE 2: PEREMAJAAN (Vegetative / NFT Hydroponics) [Front-Right: Z = +4.5, X = +2.8] ---
        const zone2Group = new THREE.Group();
        zone2Group.name = 'peremajaan';

        // NFT Bench Support
        const bench2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 5.5), tableMat);
        bench2.position.set(2.8, 0.4, 4.5);
        bench2.castShadow = true;
        bench2.receiveShadow = true;
        zone2Group.add(bench2);

        // White PVC Hydroponic NFT Gullies
        const gullyMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });
        const plantMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.5 });

        [-0.8, -0.25, 0.3, 0.85].forEach(gx => {
            // Gully tube
            const gully = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 5.3), gullyMat);
            gully.position.set(2.8 + gx, 0.86, 4.5);
            gully.castShadow = true;
            zone2Group.add(gully);

            // Young lettuce heads
            for (let pz = -2.2; pz <= 2.2; pz += 0.8) {
                const plant = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 7), plantMat);
                plant.scale.set(1.1, 0.8, 1.1);
                plant.position.set(2.8 + gx, 0.98, 4.5 + pz);
                plant.castShadow = true;
                zone2Group.add(plant);
            }
        });

        // Zone 2 Beacon Ring
        const beacon2 = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide }));
        beacon2.rotation.x = -Math.PI / 2;
        beacon2.position.set(2.8, 0.87, 4.5);
        zone2Group.add(beacon2);

        // Hit box
        const hitBox2 = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.5, 6.0), new THREE.MeshBasicMaterial({ visible: false }));
        hitBox2.position.set(2.8, 1.25, 4.5);
        hitBox2.userData = { zone: 'peremajaan', name: 'Node 2: Peremajaan (Juvenile)' };
        zone2Group.add(hitBox2);
        this.interactiveMeshes.push(hitBox2);

        this.zones.peremajaan = zone2Group;
        this.scene.add(zone2Group);

        // --- ZONE 3: DEWASA & MASTER NODE (Mature / Harvest) [Rear Area: Z = -3.5] ---
        const zone3Group = new THREE.Group();
        zone3Group.name = 'dewasa';

        // Dual Hydroponic Benches for mature lush crops
        [-2.8, 2.8].forEach(xSide => {
            const bench3 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 6.5), tableMat);
            bench3.position.set(xSide, 0.35, -3.5);
            bench3.castShadow = true;
            bench3.receiveShadow = true;
            zone3Group.add(bench3);

            // Dense full-grown lettuce heads (deep emerald green)
            const matureCropMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.6 });
            for (let mx = -0.7; mx <= 0.7; mx += 0.7) {
                for (let mz = -2.8; mz <= 2.8; mz += 0.8) {
                    const maturePlant = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), matureCropMat);
                    maturePlant.scale.set(1.2, 0.85, 1.2);
                    maturePlant.position.set(xSide + mx, 0.85, -3.5 + mz);
                    maturePlant.castShadow = true;
                    zone3Group.add(maturePlant);
                }
            }
        });

        // ESP32 Master Gateway Wall Enclosure (Mounted on rear back wall)
        const encGroup = new THREE.Group();
        encGroup.position.set(0, 1.8, -7.9);

        // Gray enclosure box
        const boxGeo = new THREE.BoxGeometry(0.8, 1.0, 0.35);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3, metalness: 0.4 });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.castShadow = true;
        encGroup.add(box);

        // OLED Display Simulation
        const oledGeo = new THREE.PlaneGeometry(0.45, 0.25);
        const oledMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
        const oled = new THREE.Mesh(oledGeo, oledMat);
        oled.position.set(0, 0.15, 0.18);
        encGroup.add(oled);

        // Antenna
        const antGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6);
        const ant = new THREE.Mesh(antGeo, new THREE.MeshStandardMaterial({ color: 0x0f172a }));
        ant.position.set(0.3, 0.65, 0);
        encGroup.add(ant);

        // Pulsing Status LED
        const ledGeo = new THREE.SphereGeometry(0.04, 12, 12);
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x22c55e });
        this.masterLed = new THREE.Mesh(ledGeo, ledMat);
        this.masterLed.position.set(0.25, 0.15, 0.185);
        encGroup.add(this.masterLed);

        zone3Group.add(encGroup);

        // Zone 3 Beacon Ring
        const beacon3 = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide }));
        beacon3.rotation.x = -Math.PI / 2;
        beacon3.position.set(0, 0.25, -3.5);
        zone3Group.add(beacon3);

        // Hit box
        const hitBox3 = new THREE.Mesh(new THREE.BoxGeometry(8.0, 2.5, 7.5), new THREE.MeshBasicMaterial({ visible: false }));
        hitBox3.position.set(0, 1.25, -3.5);
        hitBox3.userData = { zone: 'dewasa', name: 'Node 3: Dewasa (Master Gateway)' };
        zone3Group.add(hitBox3);
        this.interactiveMeshes.push(hitBox3);

        this.zones.dewasa = zone3Group;
        this.scene.add(zone3Group);
    }

    buildActuators() {
        // --- 1. EXHAUST FANS (Rear Wall) ---
        [-1.8, 1.8].forEach(x => {
            const fanHousing = new THREE.Group();
            fanHousing.position.set(x, 3.4, -7.95);

            // Circular housing frame
            const rimGeo = new THREE.TorusGeometry(0.7, 0.08, 16, 32);
            const rimMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
            const rim = new THREE.Mesh(rimGeo, rimMat);
            fanHousing.add(rim);

            // Center Motor Hub
            const hubGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.15, 16);
            const hubMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
            const hub = new THREE.Mesh(hubGeo, hubMat);
            hub.rotation.x = Math.PI / 2;
            fanHousing.add(hub);

            // Fan Blade Rotor Group (Rotates dynamically!)
            const rotor = new THREE.Group();
            for (let b = 0; b < 4; b++) {
                const bladeGeo = new THREE.BoxGeometry(0.18, 0.55, 0.02);
                const bladeMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.5, roughness: 0.3 });
                const blade = new THREE.Mesh(bladeGeo, bladeMat);
                blade.position.y = 0.32;
                blade.rotation.z = 0.2; // angle of attack
                const bladePivot = new THREE.Group();
                bladePivot.rotation.z = (b * Math.PI) / 2;
                bladePivot.add(blade);
                rotor.add(bladePivot);
            }

            fanHousing.add(rotor);
            this.fanBlades.push(rotor);
            this.scene.add(fanHousing);
        });

        // --- 2. HORTICULTURAL GROW LIGHTS (Ceiling Suspended) ---
        const lightPositions = [
            { x: -2.8, z: 4.5 },
            { x: 2.8, z: 4.5 },
            { x: -2.8, z: -3.5 },
            { x: 2.8, z: -3.5 }
        ];

        lightPositions.forEach(pos => {
            const fixtureGroup = new THREE.Group();
            fixtureGroup.position.set(pos.x, 3.2, pos.z);

            // Aluminum fixture bar
            const barGeo = new THREE.BoxGeometry(1.6, 0.08, 4.0);
            const barMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8, roughness: 0.2 });
            const bar = new THREE.Mesh(barGeo, barMat);
            fixtureGroup.add(bar);

            // Emissive Horticultural LED array strips
            const ledGeo = new THREE.PlaneGeometry(1.4, 3.8);
            const ledMat = new THREE.MeshBasicMaterial({
                color: 0x330011, // Off state: dark ruby
                transparent: true,
                opacity: 0.7
            });
            const ledMesh = new THREE.Mesh(ledGeo, ledMat);
            ledMesh.rotation.x = Math.PI / 2;
            ledMesh.position.y = -0.045;
            fixtureGroup.add(ledMesh);
            this.growLightMeshes.push(ledMesh);

            // Actual Three.js Spotlight casting dynamic light downward
            const spot = new THREE.SpotLight(0xff44aa, 0, 8, Math.PI / 4, 0.4, 1.2);
            spot.position.set(0, -0.05, 0);
            spot.target.position.set(0, -3.0, 0);
            fixtureGroup.add(spot);
            fixtureGroup.add(spot.target);
            this.growLights.push(spot);

            this.scene.add(fixtureGroup);
        });

        // --- 3. MISTING SYSTEM PARTICLES ---
        const mistParticleCount = 300;
        const mistGeo = new THREE.BufferGeometry();
        const mistPos = new Float32Array(mistParticleCount * 3);
        for (let i = 0; i < mistParticleCount * 3; i += 3) {
            mistPos[i] = -2.8 + (Math.random() - 0.5) * 2.0;
            mistPos[i + 1] = 0.9 + Math.random() * 1.8;
            mistPos[i + 2] = 4.5 + (Math.random() - 0.5) * 4.5;
        }
        mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
        const mistMat = new THREE.PointsMaterial({
            color: 0xe0f2fe,
            size: 0.15,
            transparent: true,
            opacity: 0.0 // off initially
        });
        this.mistingParticles = new THREE.Points(mistGeo, mistMat);
        this.scene.add(this.mistingParticles);
    }

    setupEventListeners() {
        // Raycasting for interactive zone selection
        this.renderer.domElement.addEventListener('pointerdown', (e) => {
            const rect = this.renderer.domElement.getBoundingClientRect();
            this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            this.raycaster.setFromCamera(this.mouse, this.camera);
            const intersects = this.raycaster.intersectObjects(this.interactiveMeshes);

            if (intersects.length > 0) {
                const zoneData = intersects[0].object.userData;
                if (zoneData && zoneData.zone) {
                    this.focusOnZone(zoneData.zone);
                }
            }
        });
    }

    /** Smoothly zoom camera into a specific zone */
    focusOnZone(zoneName) {
        if (!this.controls || typeof gsap === 'undefined') return;

        this.activeZoneFocus = zoneName;

        const targetPositions = {
            penyemaian: { cam: { x: -6.5, y: 3.5, z: 8.5 }, look: { x: -2.8, y: 1.0, z: 4.5 } },
            peremajaan: { cam: { x: 6.5, y: 3.5, z: 8.5 }, look: { x: 2.8, y: 1.0, z: 4.5 } },
            dewasa: { cam: { x: 0, y: 3.5, z: -0.5 }, look: { x: 0, y: 1.8, z: -6.5 } }
        };

        const target = targetPositions[zoneName];
        if (!target) return;

        // GSAP camera tween
        gsap.to(this.camera.position, {
            x: target.cam.x,
            y: target.cam.y,
            z: target.cam.z,
            duration: 1.4,
            ease: 'power2.inOut'
        });

        gsap.to(this.controls.target, {
            x: target.look.x,
            y: target.look.y,
            z: target.look.z,
            duration: 1.4,
            ease: 'power2.inOut'
        });

        // Trigger custom UI event
        window.dispatchEvent(new CustomEvent('lokagrow:zoneFocused', { detail: { zone: zoneName } }));
    }

    /** Reset camera to bird's-eye greenhouse overview */
    resetCamera() {
        if (!this.controls || typeof gsap === 'undefined') return;
        this.activeZoneFocus = null;

        gsap.to(this.camera.position, {
            x: 16,
            y: 12,
            z: 22,
            duration: 1.2,
            ease: 'power2.out'
        });

        gsap.to(this.controls.target, {
            x: 0,
            y: 2,
            z: 0,
            duration: 1.2,
            ease: 'power2.out'
        });

        window.dispatchEvent(new CustomEvent('lokagrow:zoneFocused', { detail: { zone: 'overview' } }));
    }

    /** Connect with SimEngine to reflect day/night and actuators */
    bindSimEngine() {
        if (!window.SimEngine) return;

        window.SimEngine.onUpdate((event, data) => {
            if (event === 'telemetry') {
                this.updateCelestial(data.timeOfDay);
                this.updateActuators(data.actuators);
            } else if (event === 'actuatorChange') {
                this.handleActuatorToggle(data.name, data.active);
            }
        });

        // Initial sync
        const payload = window.SimEngine.getLatestPayload();
        this.updateCelestial(payload.timeOfDay);
        this.updateActuators(payload.actuators);
    }

    /** Update sun trajectory, sky color, shadows, and stars */
    setSunPosition(hour) {
        this.updateCelestial(hour);
    }

    updateCelestial(hour) {
        // Sun Angle (0 to 2*PI, where 12:00 is solar zenith)
        const sunAngle = ((hour - 6.0) / 24.0) * Math.PI * 2;
        const radius = 45;

        const sunX = Math.cos(sunAngle) * radius;
        const sunY = Math.sin(sunAngle) * radius;
        const sunZ = Math.sin(sunAngle * 0.5) * 15;

        this.sunLight.position.set(sunX, Math.max(1, sunY), sunZ);
        this.sunSphere.position.set(sunX, sunY, sunZ);

        const isDay = hour >= 5.5 && hour <= 18.5;
        const isGoldenHour = (hour >= 5.5 && hour <= 7.0) || (hour >= 17.0 && hour <= 18.5);

        if (isDay) {
            this.sunLight.intensity = Math.max(0.2, (sunY / radius) * 1.5);
            this.sunSphere.visible = true;

            if (isGoldenHour) {
                this.scene.background.setHex(0xf97316); // warm sunset orange
                this.scene.fog.color.setHex(0xf97316);
                this.sunLight.color.setHex(0xff7722);
            } else {
                this.scene.background.setHex(0x38bdf8); // sky blue
                this.scene.fog.color.setHex(0x38bdf8);
                this.sunLight.color.setHex(0xfff8ee);
            }

            if (this.starField) this.starField.material.opacity = 0.0;
        } else {
            // Night
            this.sunLight.intensity = 0.05;
            this.sunLight.color.setHex(0x38bdf8); // faint moonlight
            this.sunSphere.visible = false;
            this.scene.background.setHex(0x060b14); // deep space midnight
            this.scene.fog.color.setHex(0x060b14);

            if (this.starField) this.starField.material.opacity = 0.85;
        }
    }

    /** Handle Actuators (Fans spinning, grow lights shining, mist) */
    updateActuators(actuators) {
        if (!actuators) return;
        const fanActive = typeof actuators.fan === 'object' && actuators.fan !== null 
            ? actuators.fan.state 
            : (actuators.fanState !== undefined ? actuators.fanState : actuators.fan);

        const lightsActive = typeof actuators.light === 'object' && actuators.light !== null
            ? actuators.light.state
            : (typeof actuators.lights === 'object' && actuators.lights !== null 
                ? actuators.lights.state 
                : (actuators.lightsState !== undefined ? actuators.lightsState : actuators.lights));

        const mistActive = typeof actuators.mist === 'object' && actuators.mist !== null
            ? actuators.mist.state
            : (actuators.mistState !== undefined ? actuators.mistState : actuators.mist);

        this.handleActuatorToggle('fan', fanActive);
        this.handleActuatorToggle('lights', lightsActive);
        this.handleActuatorToggle('mist', mistActive);
    }

    handleActuatorToggle(name, active) {
        if (name === 'fan') {
            this.targetFanSpeed = active ? 22.0 : 0.0;
        } else if (name === 'lights') {
            // Grow Lights
            const targetIntensity = active ? 2.5 : 0.0;
            const targetEmissive = active ? 0xff33aa : 0x220011;

            this.growLights.forEach(spot => {
                if (typeof gsap !== 'undefined') {
                    gsap.to(spot, { intensity: targetIntensity, duration: 0.4 });
                } else {
                    spot.intensity = targetIntensity;
                }
            });

            this.growLightMeshes.forEach(mesh => {
                mesh.material.color.setHex(targetEmissive);
            });
        } else if (name === 'mist') {
            this.mistActive = !!active;
            if (this.mistingParticles) {
                gsap.to(this.mistingParticles.material, {
                    opacity: active ? 0.75 : 0.0,
                    duration: 0.5
                });
            }
        }
    }

    /** Toggle Picture-in-Picture (PiP) / Docking Modes */
    setPipMode(mode) {
        const wrapper = this.container.closest('.greenhouse-3d-wrapper') || this.container;
        wrapper.classList.remove('mode-embedded', 'mode-fullscreen', 'mode-pip');

        if (mode === 'fullscreen') {
            wrapper.classList.add('mode-fullscreen');
            this.pipState = 'fullscreen';
        } else if (mode === 'pip') {
            wrapper.classList.add('mode-pip');
            this.pipState = 'pip';
        } else {
            wrapper.classList.add('mode-embedded');
            this.pipState = 'embedded';
        }

        setTimeout(() => this.onResize(), 150);
        window.dispatchEvent(new CustomEvent('lokagrow:pipModeChanged', { detail: { mode: this.pipState } }));
    }

    onResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const rect = this.container.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        this.camera.aspect = rect.width / rect.height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(rect.width, rect.height);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();

        // 1. Fan Rotation with smooth acceleration/deceleration
        this.fanSpeed += (this.targetFanSpeed - this.fanSpeed) * Math.min(1.0, delta * 3.0);
        if (this.fanSpeed > 0.01) {
            this.fanBlades.forEach(rotor => {
                rotor.rotation.z += this.fanSpeed * delta;
            });
        }

        // 2. Misting particle subtle drift
        if (this.mistActive && this.mistingParticles) {
            const positions = this.mistingParticles.geometry.attributes.position.array;
            for (let i = 1; i < positions.length; i += 3) {
                positions[i] -= delta * 0.4;
                if (positions[i] < 0.85) {
                    positions[i] = 2.6; // reset to top
                }
            }
            this.mistingParticles.geometry.attributes.position.needsUpdate = true;
        }

        // 3. Heartbeat pulse on Master ESP32 Gateway LED
        if (this.masterLed) {
            const t = this.clock.getElapsedTime();
            const pulse = (Math.sin(t * 5.0) + 1.0) * 0.5;
            this.masterLed.scale.setScalar(0.8 + pulse * 0.5);
        }

        // Controls damping
        if (this.controls) this.controls.update();

        this.renderer.render(this.scene, this.camera);
    }
}

window.Greenhouse3D = Greenhouse3D;
console.log('🌱 [Greenhouse3D] Engine loaded.');
