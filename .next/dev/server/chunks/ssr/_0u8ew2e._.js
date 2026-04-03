module.exports = [
"[project]/src/visualization/GlobeVisualization.js [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "GlobeVisualization",
    ()=>GlobeVisualization
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/three/build/three.module.js [app-ssr] (ecmascript)");
;
class GlobeVisualization {
    constructor(canvas){
        this.canvas = canvas;
        this.scene = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Scene"]();
        this.camera = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["PerspectiveCamera"](75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["WebGLRenderer"]({
            canvas,
            antialias: true,
            alpha: true
        });
        // Camera orbit state for left-drag navigation.
        this.cameraDistance = 2.5;
        this.cameraYaw = 0;
        this.cameraPitch = 0;
        this.isDragging = false;
        this.didDrag = false;
        this.lastPointerX = 0;
        this.lastPointerY = 0;
        this.rotateSpeed = 0.005;
        this.nudgeStep = 0.18;
        this.interactionMode = 'navigate';
        this.surfaceRadius = 1.002;
        this.previewRadius = 1.01;
        this.maxArcStepRad = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MathUtils"].degToRad(2);
        this.minCameraDistance = 1.25;
        this.maxCameraDistance = 7.5;
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setClearColor(0x0a0e27, 1);
        this.updateCameraPosition();
        // Add lighting
        const light = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DirectionalLight"](0xffffff, 0.8);
        light.position.set(5, 3, 5);
        this.scene.add(light);
        const ambientLight = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["AmbientLight"](0xffffff, 0.4);
        this.scene.add(ambientLight);
        // Globe base (sphere)
        const globeGeometry = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SphereGeometry"](1, 64, 64);
        const globeMaterial = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MeshPhongMaterial"]({
            color: 0x2a4a7c,
            shininess: 5
        });
        this.globe = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Mesh"](globeGeometry, globeMaterial);
        this.scene.add(this.globe);
        // Container for tectonic features
        this.tectonicsGroup = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Group"]();
        this.scene.add(this.tectonicsGroup);
        // Separate overlay group for in-progress drawing previews.
        this.previewGroup = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Group"]();
        this.scene.add(this.previewGroup);
        // Store visualization objects
        this.continents = [];
        this.subductionZones = [];
        this.volcanicArcs = [];
        this.riftZones = [];
        this.collisionZones = [];
        this.mountainRanges = [];
        this.sutureZones = [];
        this.boundaryLines = [];
        this.plumeMarkers = [];
        this.craton_markers = [];
        // Mouse drag navigation.
        this.canvas.style.cursor = 'grab';
        this.canvas.addEventListener('contextmenu', (event)=>event.preventDefault());
        this.canvas.addEventListener('mousedown', this.onMouseDown);
        this.canvas.addEventListener('wheel', this.onMouseWheel, {
            passive: false
        });
        window.addEventListener('mousemove', this.onMouseMove);
        window.addEventListener('mouseup', this.onMouseUp);
        window.addEventListener('keydown', this.onKeyDown);
        // Handle window resize
        window.addEventListener('resize', ()=>this.onWindowResize());
        this.animate();
    }
    onMouseDown = (event)=>{
        const inDrawMode = this.interactionMode === 'draw' || this.interactionMode === 'mark';
        const canPanInDrawMode = event.button === 1 || event.button === 2 || event.button === 0 && (event.shiftKey || event.altKey);
        const canPanInNavigateMode = event.button === 0 || event.button === 1 || event.button === 2;
        if (inDrawMode && !canPanInDrawMode || !inDrawMode && !canPanInNavigateMode) {
            return;
        }
        if (event.button === 2) {
            event.preventDefault();
        }
        this.isDragging = true;
        this.didDrag = false;
        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;
        this.canvas.style.cursor = 'grabbing';
    };
    onMouseMove = (event)=>{
        if (!this.isDragging) return;
        const dx = event.clientX - this.lastPointerX;
        const dy = event.clientY - this.lastPointerY;
        if (Math.abs(dx) + Math.abs(dy) > 1) {
            this.didDrag = true;
        }
        this.cameraYaw -= dx * this.rotateSpeed;
        this.cameraPitch += dy * this.rotateSpeed;
        this.cameraPitch = Math.max(-1.35, Math.min(1.35, this.cameraPitch));
        this.updateCameraPosition();
        this.lastPointerX = event.clientX;
        this.lastPointerY = event.clientY;
    };
    onMouseUp = (event)=>{
        if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
        this.isDragging = false;
        this.canvas.style.cursor = this.interactionMode === 'draw' || this.interactionMode === 'mark' ? 'crosshair' : 'grab';
    };
    setInteractionMode(mode) {
        this.interactionMode = mode;
        if (!this.isDragging) {
            this.canvas.style.cursor = mode === 'draw' || mode === 'mark' ? 'crosshair' : 'grab';
        }
    }
    onMouseWheel = (event)=>{
        event.preventDefault();
        // Negative deltaY zooms in, positive zooms out.
        this.zoomBy(event.deltaY * 0.0012);
    };
    onKeyDown = (event)=>{
        if (event.target && [
            'INPUT',
            'TEXTAREA',
            'SELECT'
        ].includes(event.target.tagName)) {
            return;
        }
        if (event.key === '+' || event.key === '=') {
            this.zoomBy(-0.14);
        } else if (event.key === '-' || event.key === '_') {
            this.zoomBy(0.14);
        } else if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
            this.nudgeView(-1, 0);
        } else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
            this.nudgeView(1, 0);
        } else if (event.key === 'ArrowUp' || event.key.toLowerCase() === 'w') {
            this.nudgeView(0, 1);
        } else if (event.key === 'ArrowDown' || event.key.toLowerCase() === 's') {
            this.nudgeView(0, -1);
        } else if (event.key.toLowerCase() === 'r') {
            this.resetView();
        }
    };
    zoomBy(amount) {
        const scale = 1 + amount;
        const safeScale = Math.max(0.5, Math.min(1.5, scale));
        this.cameraDistance = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MathUtils"].clamp(this.cameraDistance * safeScale, this.minCameraDistance, this.maxCameraDistance);
        this.updateCameraPosition();
    }
    nudgeView(yawSteps, pitchSteps) {
        this.cameraYaw += yawSteps * this.nudgeStep;
        this.cameraPitch += pitchSteps * this.nudgeStep;
        this.cameraPitch = Math.max(-1.35, Math.min(1.35, this.cameraPitch));
        this.updateCameraPosition();
    }
    resetPitch() {
        this.cameraPitch = 0;
        this.updateCameraPosition();
    }
    resetView() {
        this.cameraDistance = 2.5;
        this.cameraYaw = 0;
        this.cameraPitch = 0;
        this.updateCameraPosition();
    }
    updateCameraPosition() {
        const cosPitch = Math.cos(this.cameraPitch);
        this.camera.position.set(this.cameraDistance * Math.sin(this.cameraYaw) * cosPitch, this.cameraDistance * Math.sin(this.cameraPitch), this.cameraDistance * Math.cos(this.cameraYaw) * cosPitch);
        this.camera.lookAt(0, 0, 0);
    }
    consumeDragFlag() {
        const wasDragged = this.didDrag;
        this.didDrag = false;
        return wasDragged;
    }
    onWindowResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
    /**
   * Convert lat/lon degrees to 3D point on sphere
   */ latLonToXYZ(lat, lon) {
        const latRad = lat * Math.PI / 180;
        const lonRad = lon * Math.PI / 180;
        const x = Math.cos(latRad) * Math.cos(lonRad);
        const y = Math.sin(latRad);
        const z = Math.cos(latRad) * Math.sin(lonRad);
        return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector3"](x, y, z);
    }
    stripClosingDuplicate(points) {
        if (!points || points.length === 0) return [];
        if (points.length === 1) return [
            points[0].clone()
        ];
        const result = points.map((p)=>p.clone());
        const first = result[0];
        const last = result[result.length - 1];
        if (first.distanceToSquared(last) < 1e-10) {
            result.pop();
        }
        return result;
    }
    slerpOnSphere(a, b, t, radius) {
        const aN = a.clone().normalize();
        const bN = b.clone().normalize();
        const dot = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MathUtils"].clamp(aN.dot(bN), -1, 1);
        if (dot > 0.9995) {
            return aN.lerp(bN, t).normalize().multiplyScalar(radius);
        }
        const theta = Math.acos(dot);
        const sinTheta = Math.sin(theta);
        const wA = Math.sin((1 - t) * theta) / sinTheta;
        const wB = Math.sin(t * theta) / sinTheta;
        return aN.multiplyScalar(wA).add(bN.multiplyScalar(wB)).normalize().multiplyScalar(radius);
    }
    tessellateGreatCircle(points, closed, radius) {
        if (!points || points.length === 0) return [];
        const ring = this.stripClosingDuplicate(points);
        if (ring.length === 0) return [];
        if (ring.length === 1) return [
            ring[0].clone().normalize().multiplyScalar(radius)
        ];
        const result = [];
        const segmentCount = closed ? ring.length : ring.length - 1;
        for(let i = 0; i < segmentCount; ++i){
            const start = ring[i].clone().normalize();
            const end = ring[(i + 1) % ring.length].clone().normalize();
            const angle = Math.acos(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MathUtils"].clamp(start.dot(end), -1, 1));
            const subdivisions = Math.max(1, Math.ceil(angle / this.maxArcStepRad));
            if (i === 0) {
                result.push(start.clone().multiplyScalar(radius));
            }
            for(let step = 1; step <= subdivisions; ++step){
                const t = step / subdivisions;
                result.push(this.slerpOnSphere(start, end, t, radius));
            }
        }
        return result;
    }
    drawSphericalLine(points, color, closed, targetGroup = this.tectonicsGroup, radius = this.surfaceRadius, depthTest = true) {
        const tessellated = this.tessellateGreatCircle(points, closed, radius);
        if (tessellated.length < 2) return null;
        const geometry = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BufferGeometry"]().setFromPoints(tessellated);
        const material = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LineBasicMaterial"]({
            color,
            linewidth: 2,
            depthTest
        });
        const line = closed ? new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["LineLoop"](geometry, material) : new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Line"](geometry, material);
        targetGroup.add(line);
        return line;
    }
    sphericalTrianglePoint(a, b, c, i, j, subdivisions, radius) {
        const u = i / subdivisions;
        const v = j / subdivisions;
        const w = 1 - u - v;
        return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector3"]().addScaledVector(a, w).addScaledVector(b, u).addScaledVector(c, v).normalize().multiplyScalar(radius);
    }
    appendSphericalTrianglePatch(a, b, c, radius, subdivisions, addVertex, indices) {
        for(let i = 0; i < subdivisions; ++i){
            for(let j = 0; j < subdivisions - i; ++j){
                const pA = this.sphericalTrianglePoint(a, b, c, i, j, subdivisions, radius);
                const pB = this.sphericalTrianglePoint(a, b, c, i + 1, j, subdivisions, radius);
                const pC = this.sphericalTrianglePoint(a, b, c, i, j + 1, subdivisions, radius);
                const iA = addVertex(pA);
                const iB = addVertex(pB);
                const iC = addVertex(pC);
                indices.push(iA, iB, iC);
                if (i + j < subdivisions - 1) {
                    const pD = this.sphericalTrianglePoint(a, b, c, i + 1, j + 1, subdivisions, radius);
                    const iD = addVertex(pD);
                    indices.push(iB, iD, iC);
                }
            }
        }
    }
    sphericalAngle(a, b) {
        return Math.acos(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MathUtils"].clamp(a.clone().normalize().dot(b.clone().normalize()), -1, 1));
    }
    projectRingToLocal2D(ring) {
        const center = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector3"]();
        for (const point of ring){
            center.add(point);
        }
        if (center.lengthSq() < 1e-12) {
            center.copy(ring[0]);
        }
        center.normalize();
        const reference = Math.abs(center.y) < 0.95 ? new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector3"](0, 1, 0) : new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector3"](1, 0, 0);
        const east = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector3"]().crossVectors(reference, center).normalize();
        const north = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector3"]().crossVectors(center, east).normalize();
        return ring.map((point)=>new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector2"](point.dot(east), point.dot(north)));
    }
    /**
   * Draw a continent polygon
   */ drawContinent(lats, lons, color = 0x8B7355) {
        if (lats.length === 0) return;
        const points = [];
        for(let i = 0; i < lats.length; ++i){
            points.push(this.latLonToXYZ(lats[i], lons[i]));
        }
        const ring = this.stripClosingDuplicate(points);
        if (ring.length < 2) return;
        const line = this.drawSphericalLine(ring, color, true, this.tectonicsGroup, this.surfaceRadius);
        if (!line) return;
        this.continents.push(line);
        // Also add a filled polygon on the sphere surface
        if (ring.length >= 3) {
            this.drawSurfacePolygon(ring, color, 0.3, this.tectonicsGroup, this.surfaceRadius);
        }
    }
    drawPolygonOverlay(lats, lons, options = {}) {
        if (!lats || !lons || lats.length < 2 || lons.length < 2) return;
        const lineColor = options.lineColor ?? 0xffffff;
        const fillColor = options.fillColor ?? lineColor;
        const fillOpacity = options.fillOpacity ?? 0.2;
        const radiusOffset = options.radiusOffset ?? 0.006;
        const depthTest = options.depthTest ?? true;
        const points = [];
        const count = Math.min(lats.length, lons.length);
        for(let i = 0; i < count; ++i){
            points.push(this.latLonToXYZ(lats[i], lons[i]));
        }
        const ring = this.stripClosingDuplicate(points);
        if (ring.length < 2) return;
        this.drawSphericalLine(ring, lineColor, true, this.tectonicsGroup, this.surfaceRadius + radiusOffset, depthTest);
        if (ring.length >= 3 && fillOpacity > 0) {
            this.drawSurfacePolygon(ring, fillColor, fillOpacity, this.tectonicsGroup, this.surfaceRadius + radiusOffset);
        }
    }
    /**
   * Draw a polygon filled on the sphere surface
   */ drawSurfacePolygon(points, color, opacity, targetGroup = this.tectonicsGroup, radius = this.surfaceRadius) {
        const ring = this.stripClosingDuplicate(points);
        if (ring.length < 3) return;
        const normalisedRing = ring.map((p)=>p.clone().normalize().multiplyScalar(radius));
        const contour2D = this.projectRingToLocal2D(normalisedRing);
        const triangles = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["ShapeUtils"].triangulateShape(contour2D, []);
        if (!triangles || triangles.length === 0) return;
        const positions = [];
        const indices = [];
        const addVertex = (v)=>{
            const index = positions.length / 3;
            positions.push(v.x, v.y, v.z);
            return index;
        };
        for (const tri of triangles){
            const a = normalisedRing[tri[0]];
            const b = normalisedRing[tri[1]];
            const c = normalisedRing[tri[2]];
            const maxEdgeAngle = Math.max(this.sphericalAngle(a, b), this.sphericalAngle(b, c), this.sphericalAngle(c, a));
            const subdivisions = Math.max(1, Math.ceil(maxEdgeAngle / this.maxArcStepRad));
            this.appendSphericalTrianglePatch(a, b, c, radius, subdivisions, addVertex, indices);
        }
        const geometry = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["BufferGeometry"]();
        geometry.setAttribute('position', new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Float32BufferAttribute"](positions, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        const material = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MeshBasicMaterial"]({
            color,
            transparent: true,
            opacity,
            side: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["DoubleSide"],
            depthWrite: false
        });
        const mesh = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Mesh"](geometry, material);
        targetGroup.add(mesh);
    }
    drawDrawingPreview(lats, lons, options = {}) {
        this.clearDrawingPreview();
        if (!lats || lats.length === 0) return;
        const color = options.color ?? 0xffffff;
        const fillOpacity = options.fillOpacity ?? 0.2;
        const markerColor = options.markerColor ?? color;
        const points = [];
        for(let i = 0; i < lats.length; ++i){
            points.push(this.latLonToXYZ(lats[i], lons[i]));
        }
        // Point markers
        const markerGeometry = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SphereGeometry"](0.02, 10, 10);
        const markerMaterial = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MeshBasicMaterial"]({
            color: markerColor,
            depthTest: false
        });
        for (const p of points){
            const marker = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Mesh"](markerGeometry, markerMaterial);
            marker.position.copy(p.clone().normalize().multiplyScalar(this.previewRadius));
            marker.renderOrder = 1000;
            this.previewGroup.add(marker);
        }
        // Always close preview polygon once 2+ points are present.
        if (points.length >= 2) {
            const line = this.drawSphericalLine(points, color, true, this.previewGroup, this.previewRadius, false);
            if (line) {
                line.renderOrder = 999;
            }
        }
        if (points.length >= 3) {
            this.drawSurfacePolygon(points, color, fillOpacity, this.previewGroup, this.previewRadius);
        }
    }
    clearDrawingPreview() {
        while(this.previewGroup.children.length > 0){
            this.previewGroup.remove(this.previewGroup.children[0]);
        }
    }
    /**
   * Draw subduction zone (dark vibrant blue lines)
   */ drawSubductionZone(lats, lons) {
        if (lats.length === 0) return;
        const points = [];
        for(let i = 0; i < lats.length; ++i){
            points.push(this.latLonToXYZ(lats[i], lons[i]));
        }
        const line = this.drawSphericalLine(points, 0x0a32d6, false, this.tectonicsGroup, this.surfaceRadius + 0.001);
        if (!line) return;
        this.subductionZones.push(line);
    }
    drawVolcanicArc(lats, lons) {
        if (lats.length === 0) return;
        const points = [];
        for(let i = 0; i < lats.length; ++i){
            points.push(this.latLonToXYZ(lats[i], lons[i]));
        }
        const line = this.drawSphericalLine(points, 0xffcc44, false, this.tectonicsGroup, this.surfaceRadius + 0.002);
        if (!line) return;
        this.volcanicArcs.push(line);
    }
    /**
   * Draw rift zone (neon red for active continental rifts)
   */ drawRiftZone(lats, lons) {
        if (lats.length === 0) return;
        const points = [];
        for(let i = 0; i < lats.length; ++i){
            points.push(this.latLonToXYZ(lats[i], lons[i]));
        }
        const line = this.drawSphericalLine(points, 0xff1744, false, this.tectonicsGroup, this.surfaceRadius + 0.001);
        if (!line) return;
        this.riftZones.push(line);
    }
    /**
   * Draw mid-ocean ridge (orange-yellow for seafloor spreading centers)
   */ drawMidOceanRidge(lats, lons) {
        if (lats.length === 0) return;
        const points = [];
        for(let i = 0; i < lats.length; ++i){
            points.push(this.latLonToXYZ(lats[i], lons[i]));
        }
        const line = this.drawSphericalLine(points, 0xffa726, false, this.tectonicsGroup, this.surfaceRadius + 0.002);
        if (!line) return;
        this.riftZones.push(line);
    }
    /**
   * Draw collision zone (red lines)
   */ drawCollisionZone(lats, lons) {
        if (lats.length === 0) return;
        const points = [];
        for(let i = 0; i < lats.length; ++i){
            points.push(this.latLonToXYZ(lats[i], lons[i]));
        }
        const line = this.drawSphericalLine(points, 0xff0000, false, this.tectonicsGroup, this.surfaceRadius + 0.001);
        if (!line) return;
        this.collisionZones.push(line);
    }
    drawMountainRange(lats, lons) {
        if (lats.length === 0) return;
        const points = [];
        for(let i = 0; i < lats.length; ++i){
            points.push(this.latLonToXYZ(lats[i], lons[i]));
        }
        const line = this.drawSphericalLine(points, 0xff88aa, false, this.tectonicsGroup, this.surfaceRadius + 0.004);
        if (!line) return;
        this.mountainRanges.push(line);
    }
    drawBoundary(lats, lons) {
        if (lats.length === 0) return;
        const points = [];
        for(let i = 0; i < lats.length; ++i){
            points.push(this.latLonToXYZ(lats[i], lons[i]));
        }
        const line = this.drawSphericalLine(points, 0x66bbff, false, this.tectonicsGroup, this.surfaceRadius + 0.0004);
        if (!line) return;
        this.boundaryLines.push(line);
    }
    drawSutureZone(lats, lons) {
        if (lats.length === 0) return;
        const points = [];
        for(let i = 0; i < lats.length; ++i){
            points.push(this.latLonToXYZ(lats[i], lons[i]));
        }
        const line = this.drawSphericalLine(points, 0x9c6bff, false, this.tectonicsGroup, this.surfaceRadius + 0.003);
        if (!line) return;
        this.sutureZones.push(line);
    }
    drawPlume(lat, lon, strength = 1) {
        const pos = this.latLonToXYZ(lat, lon).multiplyScalar(this.surfaceRadius + 0.012);
        const size = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MathUtils"].clamp(0.03 + strength * 0.02, 0.03, 0.08);
        const geometry = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SphereGeometry"](size, 10, 10);
        const material = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MeshBasicMaterial"]({
            color: 0xff4f3d
        });
        const marker = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Mesh"](geometry, material);
        marker.position.copy(pos);
        this.tectonicsGroup.add(marker);
        this.plumeMarkers.push(marker);
    }
    /**
   * Draw craton marker (colored sphere)
   */ drawCraton(lat, lon, color = 0xffff00) {
        const pos = this.latLonToXYZ(lat, lon).multiplyScalar(this.surfaceRadius + 0.01);
        const geometry = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["SphereGeometry"](0.05, 16, 16);
        const material = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MeshBasicMaterial"]({
            color
        });
        const sphere = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Mesh"](geometry, material);
        sphere.position.copy(pos);
        this.tectonicsGroup.add(sphere);
        this.craton_markers.push(sphere);
    }
    /**
   * Clear all visualization
   */ clear() {
        while(this.tectonicsGroup.children.length > 0){
            this.tectonicsGroup.remove(this.tectonicsGroup.children[0]);
        }
        this.clearDrawingPreview();
        this.continents = [];
        this.subductionZones = [];
        this.volcanicArcs = [];
        this.riftZones = [];
        this.collisionZones = [];
        this.mountainRanges = [];
        this.sutureZones = [];
        this.boundaryLines = [];
        this.plumeMarkers = [];
        this.craton_markers = [];
    }
    /**
   * Update visualization from simulation state
   */ updateFromSimulation(sim) {
        this.clear();
        const plateCount = sim.getPlateCount();
        for(let p = 0; p < plateCount; ++p){
            // Draw all continents on this plate
            for(let c = 0; c < 10; ++c){
                const lats = sim.getContinentLats(p, c);
                if (lats.length > 0) {
                    const lons = sim.getContinentLons(p, c);
                    // Color continents differently based on plate
                    const color = 0x8B7355 + p * 0x1111;
                    this.drawContinent(lats, lons, color);
                }
            }
        }
        // Draw subduction zones (blue)
        const subductionCount = sim.getSubductionZoneCount();
        for(let s = 0; s < subductionCount; ++s){
            const lats = sim.getSubductionZoneLats(s);
            if (lats.length > 0) {
                const lons = sim.getSubductionZoneLons(s);
                this.drawSubductionZone(lats, lons);
            }
            if (typeof sim.getSubductionVolcanicArcLats === 'function') {
                const arcLats = sim.getSubductionVolcanicArcLats(s);
                if (arcLats.length > 0) {
                    const arcLons = sim.getSubductionVolcanicArcLons(s);
                    this.drawVolcanicArc(arcLats, arcLons);
                }
            }
        }
        if (typeof sim.getRiftZoneCount === 'function' && typeof sim.getRiftZoneLats === 'function' && typeof sim.getRiftZoneLons === 'function') {
            const riftCount = sim.getRiftZoneCount();
            for(let r = 0; r < riftCount; ++r){
                const lats = sim.getRiftZoneLats(r);
                if (lats.length > 0) {
                    const lons = sim.getRiftZoneLons(r);
                    // Draw oceanic rifts as mid-ocean ridges (orange), continental rifts as red
                    if (typeof sim.isRiftZoneOceanic === 'function' && sim.isRiftZoneOceanic(r)) {
                        this.drawMidOceanRidge(lats, lons);
                    } else {
                        this.drawRiftZone(lats, lons);
                    }
                }
            }
        }
        if (typeof sim.getCollisionZoneCount === 'function' && typeof sim.getCollisionZoneLats === 'function' && typeof sim.getCollisionZoneLons === 'function') {
            const collisionCount = sim.getCollisionZoneCount();
            for(let c = 0; c < collisionCount; ++c){
                const lats = sim.getCollisionZoneLats(c);
                if (lats.length > 0) {
                    const lons = sim.getCollisionZoneLons(c);
                    this.drawCollisionZone(lats, lons);
                }
                if (typeof sim.getMountainRangeLats === 'function' && typeof sim.getMountainRangeLons === 'function') {
                    const mLats = sim.getMountainRangeLats(c);
                    if (mLats.length > 0) {
                        const mLons = sim.getMountainRangeLons(c);
                        this.drawMountainRange(mLats, mLons);
                    }
                }
            }
        }
        // Boundary segments are kept internal for logic and not rendered by default to avoid UI clutter.
        if (typeof sim.getCratonCount === 'function' && typeof sim.getCratonLat === 'function' && typeof sim.getCratonLon === 'function') {
        // Cratons are only shown during setup, not during simulation playback
        // to avoid visual clutter with unlabeled dots
        }
        if (typeof sim.getSutureCount === 'function' && typeof sim.getSutureZoneLats === 'function' && typeof sim.getSutureZoneLons === 'function') {
            const sutureCount = sim.getSutureCount();
            for(let s = 0; s < sutureCount; ++s){
                const lats = sim.getSutureZoneLats(s);
                if (lats.length > 0) {
                    const lons = sim.getSutureZoneLons(s);
                    this.drawSutureZone(lats, lons);
                }
            }
        }
    }
    /**
   * Start animation loop
   */ animate = ()=>{
        requestAnimationFrame(this.animate);
        this.renderer.render(this.scene, this.camera);
    };
}
}),
"[project]/app/page.jsx [app-ssr] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>WilsonCyclesApp
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react-jsx-dev-runtime.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/ssr/react.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/three/build/three.module.js [app-ssr] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle-check.js [app-ssr] (ecmascript) <export default as CheckCircle2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Circle$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/circle.js [app-ssr] (ecmascript) <export default as Circle>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2d$3$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Clock3$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/clock-3.js [app-ssr] (ecmascript) <export default as Clock3>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$compass$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Compass$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/compass.js [app-ssr] (ecmascript) <export default as Compass>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eye$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Eye$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/eye.js [app-ssr] (ecmascript) <export default as Eye>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layers$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Layers$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/layers.js [app-ssr] (ecmascript) <export default as Layers>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/map-pin.js [app-ssr] (ecmascript) <export default as MapPin>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$move$2d$down$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MoveDown$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/move-down.js [app-ssr] (ecmascript) <export default as MoveDown>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$move$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MoveLeft$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/move-left.js [app-ssr] (ecmascript) <export default as MoveLeft>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$move$2d$right$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MoveRight$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/move-right.js [app-ssr] (ecmascript) <export default as MoveRight>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$move$2d$up$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MoveUp$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/move-up.js [app-ssr] (ecmascript) <export default as MoveUp>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pause$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Pause$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/pause.js [app-ssr] (ecmascript) <export default as Pause>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pencil$2d$line$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PencilLine$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/pencil-line.js [app-ssr] (ecmascript) <export default as PencilLine>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$play$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Play$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/play.js [app-ssr] (ecmascript) <export default as Play>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/rotate-ccw.js [app-ssr] (ecmascript) <export default as RotateCcw>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$save$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Save$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/save.js [app-ssr] (ecmascript) <export default as Save>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/trash-2.js [app-ssr] (ecmascript) <export default as Trash2>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$zoom$2d$in$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ZoomIn$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/zoom-in.js [app-ssr] (ecmascript) <export default as ZoomIn>");
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$zoom$2d$out$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ZoomOut$3e$__ = __turbopack_context__.i("[project]/node_modules/lucide-react/dist/esm/icons/zoom-out.js [app-ssr] (ecmascript) <export default as ZoomOut>");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$visualization$2f$GlobeVisualization$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/visualization/GlobeVisualization.js [app-ssr] (ecmascript)");
'use client';
;
;
;
;
;
function getCurrentPhase(time) {
    if (time < 50) return 'Embryonic Rifting';
    if (time < 200) return 'Young Ocean Opening';
    if (time < 350) return 'Mature Ocean Basin';
    if (time < 550) return 'Declining Ocean / Subduction';
    if (time < 750) return 'Terminal Closure';
    return 'Orogeny and Suturing';
}
function createManualSimulationStub() {
    return {
        _time: 0,
        _cratonCount: 0,
        initSupercontinent () {},
        addCraton () {
            this._cratonCount += 1;
        },
        step (dt) {
            this._time = Math.max(0, this._time + dt);
        },
        reset () {
            this._time = 0;
            this._cratonCount = 0;
        },
        getCurrentTime () {
            return this._time;
        },
        getPlateCount () {
            return 0;
        },
        getSubductionZoneCount () {
            return 0;
        },
        getRiftZoneCount () {
            return 0;
        },
        getCollisionZoneCount () {
            return 0;
        },
        getCratonCount () {
            return this._cratonCount;
        },
        getPlumeCount () {
            return 0;
        },
        getSutureCount () {
            return 0;
        }
    };
}
function WilsonCyclesApp() {
    const canvasRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const rafRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const simRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const globeRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(null);
    const drawingPointsRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({
        lats: [],
        lons: []
    });
    const supercontinentPolygonRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({
        lats: [],
        lons: []
    });
    const currentCratonDraftRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])({
        lats: [],
        lons: []
    });
    const cratonPolygonsRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])([]);
    const interactionModeRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])('navigate');
    const isPlayingRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    const isSetupCompleteRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(false);
    const simSpeedRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(5);
    const updateVisualizationRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(()=>{});
    const onCanvasClickRef = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useRef"])(()=>{});
    const [isLoaded, setIsLoaded] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [isPlaying, setIsPlaying] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [isSetupComplete, setIsSetupComplete] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [interactionMode, setInteractionMode] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('navigate');
    const [simSpeed, setSimSpeed] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(5);
    const [simTime, setSimTime] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [phaseText, setPhaseText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('Waiting for setup');
    const [statusText, setStatusText] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('Click Start Drawing to place supercontinent vertices.');
    const [lastGpmlFileName, setLastGpmlFileName] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])('');
    const [isSavingGpml, setIsSavingGpml] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(false);
    const [uiVersion, setUiVersion] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])(0);
    const [stats, setStats] = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useState"])({
        plates: 0,
        subzones: 0,
        rifts: 0,
        collisions: 0,
        cratons: 0,
        plumes: 0,
        sutures: 0
    });
    const bumpUi = ()=>setUiVersion((v)=>v + 1);
    const closePolygon = (lats, lons)=>{
        const result = {
            lats: [
                ...lats
            ],
            lons: [
                ...lons
            ]
        };
        if (result.lats.length < 3 || result.lons.length < 3) {
            return result;
        }
        const lastIdx = result.lats.length - 1;
        const isClosed = Math.abs(result.lats[0] - result.lats[lastIdx]) < 1e-6 && Math.abs(result.lons[0] - result.lons[lastIdx]) < 1e-6;
        if (!isClosed) {
            result.lats.push(result.lats[0]);
            result.lons.push(result.lons[0]);
        }
        return result;
    };
    const stripClosedPolygon = (polygon)=>{
        if (!polygon || polygon.lats.length === 0 || polygon.lons.length === 0) {
            return {
                lats: [],
                lons: []
            };
        }
        const lats = [
            ...polygon.lats
        ];
        const lons = [
            ...polygon.lons
        ];
        if (lats.length > 1) {
            const last = lats.length - 1;
            const isClosed = Math.abs(lats[0] - lats[last]) < 1e-6 && Math.abs(lons[0] - lons[last]) < 1e-6;
            if (isClosed) {
                lats.pop();
                lons.pop();
            }
        }
        return {
            lats,
            lons
        };
    };
    const escapeXml = (value)=>{
        return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
    };
    const polygonToGpmlPosList = (polygon)=>{
        const closed = closePolygon(polygon.lats, polygon.lons);
        const count = Math.min(closed.lats.length, closed.lons.length);
        const pairs = [];
        for(let i = 0; i < count; ++i){
            pairs.push(`${closed.lons[i].toFixed(6)} ${closed.lats[i].toFixed(6)}`);
        }
        return pairs.join(' ');
    };
    const buildGpmlFeatureXml = ({ id, name, role, plateId, polygon })=>{
        return `
    <gpml:featureMember>
      <gpml:UnclassifiedFeature gml:id="${escapeXml(id)}">
        <gpml:name>${escapeXml(name)}</gpml:name>
        <gpml:description>${escapeXml(role)}</gpml:description>
        <gpml:reconstructionPlateId>${plateId}</gpml:reconstructionPlateId>
        <gpml:validTime>
          <gpml:TimePeriod>
            <gpml:begin>0.0</gpml:begin>
            <gpml:end>1000.0</gpml:end>
          </gpml:TimePeriod>
        </gpml:validTime>
        <gpml:geometry>
          <gml:Polygon srsName="urn:ogc:def:crs:EPSG::4326">
            <gml:exterior>
              <gml:LinearRing>
                <gml:posList>${polygonToGpmlPosList(polygon)}</gml:posList>
              </gml:LinearRing>
            </gml:exterior>
          </gml:Polygon>
        </gpml:geometry>
      </gpml:UnclassifiedFeature>
    </gpml:featureMember>`;
    };
    const buildGpmlDocument = (supercontinentPolygon, cratonPolygons)=>{
        const nowIso = new Date().toISOString();
        const featureBlocks = [
            buildGpmlFeatureXml({
                id: 'feature-supercontinent-1',
                name: 'Supercontinent',
                role: 'supercontinent-outline',
                plateId: 0,
                polygon: supercontinentPolygon
            })
        ];
        for(let i = 0; i < cratonPolygons.length; ++i){
            const craton = cratonPolygons[i];
            featureBlocks.push(buildGpmlFeatureXml({
                id: `feature-craton-${i + 1}`,
                name: craton.name || `Craton ${i + 1}`,
                role: 'craton-polygon',
                plateId: 0,
                polygon: craton
            }));
        }
        return `<?xml version="1.0" encoding="UTF-8"?>
<gpml:FeatureCollection
  xmlns:gpml="http://www.gplates.org/gplates"
  xmlns:gml="http://www.opengis.net/gml"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.gplates.org/gplates gpml.xsd">
  <gpml:metadata>
    <gpml:creator>GeoForge manual export</gpml:creator>
    <gpml:created>${escapeXml(nowIso)}</gpml:created>
  </gpml:metadata>
${featureBlocks.join('\n')}
</gpml:FeatureCollection>
`;
    };
    const exportCurrentGpml = async (options = {})=>{
        const { setStatus = true } = options;
        const activeSupercontinent = getCurrentSupercontinentPolygon();
        if (!activeSupercontinent || activeSupercontinent.lats.length < 4) {
            if (setStatus) {
                setStatusText('Draw and close a supercontinent polygon before exporting GPML.');
            }
            return null;
        }
        const supercontinentClosed = closePolygon(activeSupercontinent.lats, activeSupercontinent.lons);
        const cratonsClosed = cratonPolygonsRef.current.map((craton)=>({
                ...craton,
                ...closePolygon(craton.lats, craton.lons)
            }));
        const gpml = buildGpmlDocument(supercontinentClosed, cratonsClosed);
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const fileName = `gplates-input-${stamp}.gpml`;
        setIsSavingGpml(true);
        try {
            const response = await fetch('/api/gpml/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    fileName,
                    gpmlContent: gpml
                })
            });
            let payload = null;
            try {
                payload = await response.json();
            } catch  {
                payload = null;
            }
            if (!response.ok) {
                const message = payload?.error || 'Unable to save GPML in project.';
                throw new Error(message);
            }
            const savedName = payload?.fileName || fileName;
            const currentPath = payload?.currentPath || '/gpml/current.gpml';
            setLastGpmlFileName(savedName);
            if (setStatus) {
                setStatusText(`Saved GPML to project at ${currentPath}.`);
            }
            return {
                fileName: savedName,
                currentPath,
                publicPath: payload?.publicPath || `/gpml/${savedName}`
            };
        } catch (error) {
            if (setStatus) {
                setStatusText(`Failed to save GPML in project: ${error?.message || error}`);
            }
            return null;
        } finally{
            setIsSavingGpml(false);
        }
    };
    const getCurrentSupercontinentPolygon = ()=>{
        if (drawingPointsRef.current.lats.length >= 3) {
            return closePolygon(drawingPointsRef.current.lats, drawingPointsRef.current.lons);
        }
        if (supercontinentPolygonRef.current.lats.length >= 3) {
            return closePolygon(supercontinentPolygonRef.current.lats, supercontinentPolygonRef.current.lons);
        }
        return null;
    };
    const latLonToUnitVector = (lat, lon)=>{
        const latRad = lat * Math.PI / 180;
        const lonRad = lon * Math.PI / 180;
        return new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector3"](Math.cos(latRad) * Math.cos(lonRad), Math.sin(latRad), Math.cos(latRad) * Math.sin(lonRad)).normalize();
    };
    const approximateCratonCenterRadius = (cratonPolygon)=>{
        const ring = stripClosedPolygon(cratonPolygon);
        const centerVec = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector3"]();
        for(let i = 0; i < ring.lats.length; ++i){
            centerVec.add(latLonToUnitVector(ring.lats[i], ring.lons[i]));
        }
        if (centerVec.lengthSq() < 1e-12) {
            centerVec.copy(latLonToUnitVector(ring.lats[0], ring.lons[0]));
        }
        centerVec.normalize();
        let maxAngleRad = 0;
        for(let i = 0; i < ring.lats.length; ++i){
            const v = latLonToUnitVector(ring.lats[i], ring.lons[i]);
            const angle = Math.acos(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MathUtils"].clamp(centerVec.dot(v), -1, 1));
            maxAngleRad = Math.max(maxAngleRad, angle);
        }
        const lat = Math.asin(centerVec.y) * 180 / Math.PI;
        const lon = Math.atan2(centerVec.z, centerVec.x) * 180 / Math.PI;
        return {
            lat,
            lon,
            radiusDegrees: Math.max(1, maxAngleRad * 180 / Math.PI)
        };
    };
    const isPointInsideSphericalPolygon = (lat, lon, polygon)=>{
        const ring = stripClosedPolygon(polygon);
        if (ring.lats.length < 3) return false;
        const p = latLonToUnitVector(lat, lon);
        let angleSum = 0;
        for(let i = 0; i < ring.lats.length; ++i){
            const next = (i + 1) % ring.lats.length;
            const vi = latLonToUnitVector(ring.lats[i], ring.lons[i]);
            const vj = latLonToUnitVector(ring.lats[next], ring.lons[next]);
            const a = vi.clone().sub(p.clone().multiplyScalar(vi.dot(p)));
            const b = vj.clone().sub(p.clone().multiplyScalar(vj.dot(p)));
            if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) {
                continue;
            }
            a.normalize();
            b.normalize();
            const cross = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector3"]().crossVectors(a, b);
            const sin = cross.dot(p);
            const cos = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["MathUtils"].clamp(a.dot(b), -1, 1);
            angleSum += Math.atan2(sin, cos);
        }
        return Math.abs(angleSum) > Math.PI;
    };
    const isPolygonInsidePolygon = (innerPolygon, outerPolygon)=>{
        const inner = stripClosedPolygon(innerPolygon);
        if (inner.lats.length < 3) return false;
        for(let i = 0; i < inner.lats.length; ++i){
            if (!isPointInsideSphericalPolygon(inner.lats[i], inner.lons[i], outerPolygon)) {
                return false;
            }
        }
        const centroid = approximateCratonCenterRadius(innerPolygon);
        return isPointInsideSphericalPolygon(centroid.lat, centroid.lon, outerPolygon);
    };
    const setInteraction = (mode)=>{
        interactionModeRef.current = mode;
        setInteractionMode(mode);
        if (globeRef.current) {
            globeRef.current.setInteractionMode(mode);
        }
    };
    const syncDerivedUiState = ()=>{
        bumpUi();
    };
    const renderPolygonLayers = ()=>{
        const globe = globeRef.current;
        if (!globe) return;
        const activeSupercontinent = getCurrentSupercontinentPolygon();
        if (activeSupercontinent && activeSupercontinent.lats.length >= 4) {
            globe.drawPolygonOverlay(activeSupercontinent.lats, activeSupercontinent.lons, {
                lineColor: 0x8b7355,
                fillColor: 0x8b7355,
                fillOpacity: isSetupCompleteRef.current ? 0.2 : 0.28,
                radiusOffset: 0.003
            });
        }
        for (const craton of cratonPolygonsRef.current){
            globe.drawPolygonOverlay(craton.lats, craton.lons, {
                lineColor: isSetupCompleteRef.current ? 0xffee58 : 0xffd54f,
                fillColor: 0xffc107,
                fillOpacity: isSetupCompleteRef.current ? 0.3 : 0.24,
                radiusOffset: isSetupCompleteRef.current ? 0.012 : 0.007
            });
        }
        if (interactionModeRef.current === 'draw') {
            globe.drawDrawingPreview(drawingPointsRef.current.lats, drawingPointsRef.current.lons, {
                color: 0xffffff,
                fillOpacity: 0.16
            });
        } else if (interactionModeRef.current === 'mark') {
            globe.drawDrawingPreview(currentCratonDraftRef.current.lats, currentCratonDraftRef.current.lons, {
                color: 0xffd54f,
                fillOpacity: 0.22
            });
        } else {
            globe.clearDrawingPreview();
        }
    };
    const updateVisualization = ()=>{
        const sim = simRef.current;
        const globe = globeRef.current;
        if (!sim || !globe) return;
        if (isSetupCompleteRef.current) {
            globe.updateFromSimulation(sim);
        } else {
            globe.clear();
        }
        renderPolygonLayers();
        const time = sim.getCurrentTime();
        setSimTime(time);
        setPhaseText(getCurrentPhase(time));
        setStats({
            plates: isSetupCompleteRef.current ? sim.getPlateCount() : 0,
            subzones: sim.getSubductionZoneCount(),
            rifts: sim.getRiftZoneCount(),
            collisions: sim.getCollisionZoneCount(),
            cratons: isSetupCompleteRef.current && typeof sim.getCratonCount === 'function' ? sim.getCratonCount() : cratonPolygonsRef.current.length,
            plumes: typeof sim.getPlumeCount === 'function' ? sim.getPlumeCount() : 0,
            sutures: typeof sim.getSutureCount === 'function' ? sim.getSutureCount() : 0
        });
    };
    updateVisualizationRef.current = updateVisualization;
    const resetSceneData = ()=>{
        drawingPointsRef.current = {
            lats: [],
            lons: []
        };
        supercontinentPolygonRef.current = {
            lats: [],
            lons: []
        };
        currentCratonDraftRef.current = {
            lats: [],
            lons: []
        };
        cratonPolygonsRef.current = [];
    };
    const startDrawing = ()=>{
        isPlayingRef.current = false;
        setIsPlaying(false);
        isSetupCompleteRef.current = false;
        setIsSetupComplete(false);
        resetSceneData();
        setInteraction('draw');
        setStatusText('Drawing supercontinent. Left-click to place vertices.');
        syncDerivedUiState();
        updateVisualizationRef.current();
    };
    const clearDrawing = ()=>{
        resetSceneData();
        isSetupCompleteRef.current = false;
        setIsSetupComplete(false);
        setStatusText('Cleared polygons. Start drawing again.');
        syncDerivedUiState();
        updateVisualizationRef.current();
    };
    const startMarkingCratons = ()=>{
        const activeSupercontinent = getCurrentSupercontinentPolygon();
        if (!activeSupercontinent || activeSupercontinent.lats.length < 4) {
            setStatusText('Draw a valid supercontinent polygon first.');
            return;
        }
        isSetupCompleteRef.current = false;
        setIsSetupComplete(false);
        currentCratonDraftRef.current = {
            lats: [],
            lons: []
        };
        setInteraction('mark');
        setStatusText('Marking cratons. Left-click to draw a craton polygon.');
        syncDerivedUiState();
        updateVisualizationRef.current();
    };
    const clearCurrentCratonDraft = ()=>{
        currentCratonDraftRef.current = {
            lats: [],
            lons: []
        };
        setStatusText('Cleared current craton draft.');
        syncDerivedUiState();
        updateVisualizationRef.current();
    };
    const saveCurrentCratonPolygon = ()=>{
        if (currentCratonDraftRef.current.lats.length < 3) {
            setStatusText('Need at least 3 points to save a craton polygon.');
            return;
        }
        const activeSupercontinent = getCurrentSupercontinentPolygon();
        if (!activeSupercontinent || activeSupercontinent.lats.length < 4) {
            setStatusText('No valid supercontinent available for containment check.');
            return;
        }
        const closedDraft = closePolygon(currentCratonDraftRef.current.lats, currentCratonDraftRef.current.lons);
        const closedSupercontinent = closePolygon(activeSupercontinent.lats, activeSupercontinent.lons);
        if (!isPolygonInsidePolygon(closedDraft, closedSupercontinent)) {
            setStatusText('Craton polygon must be fully inside the supercontinent polygon.');
            return;
        }
        cratonPolygonsRef.current.push({
            id: cratonPolygonsRef.current.length + 1,
            name: `Craton ${cratonPolygonsRef.current.length + 1}`,
            lats: closedDraft.lats,
            lons: closedDraft.lons
        });
        currentCratonDraftRef.current = {
            lats: [],
            lons: []
        };
        setStatusText('Saved craton polygon.');
        syncDerivedUiState();
        updateVisualizationRef.current();
    };
    const finishSetup = async ()=>{
        const sim = simRef.current;
        if (!sim) return;
        const activeSupercontinent = getCurrentSupercontinentPolygon();
        if (!activeSupercontinent || activeSupercontinent.lats.length < 4) {
            setStatusText('Need a closed supercontinent polygon with at least 3 vertices.');
            return;
        }
        const closed = closePolygon(activeSupercontinent.lats, activeSupercontinent.lons);
        supercontinentPolygonRef.current = closed;
        drawingPointsRef.current = {
            lats: [
                ...closed.lats
            ],
            lons: [
                ...closed.lons
            ]
        };
        // If the user has an unfinished craton draft, commit it on finish when valid.
        if (currentCratonDraftRef.current.lats.length >= 3) {
            const closedDraft = closePolygon(currentCratonDraftRef.current.lats, currentCratonDraftRef.current.lons);
            if (isPolygonInsidePolygon(closedDraft, closed)) {
                cratonPolygonsRef.current.push({
                    id: cratonPolygonsRef.current.length + 1,
                    name: `Craton ${cratonPolygonsRef.current.length + 1}`,
                    lats: closedDraft.lats,
                    lons: closedDraft.lons
                });
            }
            currentCratonDraftRef.current = {
                lats: [],
                lons: []
            };
        }
        sim.initSupercontinent(closed.lats, closed.lons);
        for (const polygon of cratonPolygonsRef.current){
            const approx = approximateCratonCenterRadius(polygon);
            sim.addCraton(approx.lat, approx.lon, approx.radiusDegrees);
        }
        setInteraction('navigate');
        isSetupCompleteRef.current = true;
        setIsSetupComplete(true);
        const exported = await exportCurrentGpml({
            setStatus: false
        });
        if (exported) {
            setStatusText(`Setup complete. Saved GPML in project at ${exported.currentPath} with supercontinent + ${cratonPolygonsRef.current.length} cratons.`);
        } else {
            setStatusText('Setup complete. Manual mode active (no tectonic simulation).');
        }
        syncDerivedUiState();
        updateVisualizationRef.current();
    };
    const resetSimulation = ()=>{
        const sim = simRef.current;
        if (!sim) return;
        sim.reset();
        isPlayingRef.current = false;
        setIsPlaying(false);
        isSetupCompleteRef.current = false;
        setIsSetupComplete(false);
        setInteraction('navigate');
        if (globeRef.current) {
            globeRef.current.resetView();
        }
        resetSceneData();
        setSimTime(0);
        setPhaseText('Waiting for setup');
        setStatusText('Simulation reset. Draw a supercontinent to begin again.');
        syncDerivedUiState();
        updateVisualizationRef.current();
    };
    const jumpToTime = (value)=>{
        const sim = simRef.current;
        if (!sim) return;
        const targetTime = parseFloat(value);
        const currentTime = sim.getCurrentTime();
        const dt = targetTime - currentTime;
        if (Math.abs(dt) > 0.05) {
            sim.step(dt);
            updateVisualizationRef.current();
        }
    };
    const hasSupercontinent = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const poly = getCurrentSupercontinentPolygon();
        return !!poly && poly.lats.length >= 4;
    }, [
        uiVersion
    ]);
    const hasCratonDraft = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        return currentCratonDraftRef.current.lats.length > 0;
    }, [
        uiVersion
    ]);
    const canSaveCraton = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        return interactionMode === 'mark' && currentCratonDraftRef.current.lats.length >= 3;
    }, [
        interactionMode,
        uiVersion
    ]);
    const outlinerRows = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useMemo"])(()=>{
        const rows = [];
        const activeSupercontinent = getCurrentSupercontinentPolygon();
        if (activeSupercontinent && activeSupercontinent.lats.length >= 4) {
            const ring = stripClosedPolygon(activeSupercontinent);
            rows.push({
                key: 'supercontinent',
                color: '#9a8055',
                label: 'Supercontinent',
                meta: `${ring.lats.length} vertices • ${isSetupComplete ? 'committed' : 'draft'}`
            });
        }
        for (const craton of cratonPolygonsRef.current){
            const ring = stripClosedPolygon(craton);
            rows.push({
                key: `craton-${craton.id}`,
                color: '#ffcf55',
                label: craton.name,
                meta: `${ring.lats.length} vertices • inside supercontinent`
            });
        }
        if (currentCratonDraftRef.current.lats.length >= 2) {
            const draftRing = stripClosedPolygon(closePolygon(currentCratonDraftRef.current.lats, currentCratonDraftRef.current.lons));
            rows.push({
                key: 'craton-draft',
                color: '#ffe082',
                label: 'Craton Draft',
                meta: `${draftRing.lats.length} vertices • unsaved`
            });
        }
        return rows;
    }, [
        uiVersion,
        isSetupComplete
    ]);
    onCanvasClickRef.current = (event)=>{
        if (!globeRef.current) return;
        if (interactionModeRef.current === 'navigate') return;
        if (globeRef.current.consumeDragFlag()) return;
        const rect = canvasRef.current.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const ndcX = 2 * x / rect.width - 1;
        const ndcY = 1 - 2 * y / rect.height;
        const raycaster = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Raycaster"]();
        raycaster.setFromCamera({
            x: ndcX,
            y: ndcY
        }, globeRef.current.camera);
        const sphere = new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Sphere"](new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector3"](0, 0, 0), 1);
        const point = raycaster.ray.intersectSphere(sphere, new __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$three$2f$build$2f$three$2e$module$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["Vector3"]());
        if (!point) return;
        const lat = Math.asin(point.y) * 180 / Math.PI;
        const lon = Math.atan2(point.z, point.x) * 180 / Math.PI;
        if (interactionModeRef.current === 'draw') {
            drawingPointsRef.current.lats.push(lat);
            drawingPointsRef.current.lons.push(lon);
            setStatusText(`Supercontinent point added (${lat.toFixed(1)}, ${lon.toFixed(1)}).`);
        } else if (interactionModeRef.current === 'mark') {
            currentCratonDraftRef.current.lats.push(lat);
            currentCratonDraftRef.current.lons.push(lon);
            setStatusText(`Craton point added (${lat.toFixed(1)}, ${lon.toFixed(1)}).`);
        }
        syncDerivedUiState();
        updateVisualizationRef.current();
    };
    (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["useEffect"])(()=>{
        let cancelled = false;
        simRef.current = createManualSimulationStub();
        if (canvasRef.current && !globeRef.current) {
            globeRef.current = new __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$visualization$2f$GlobeVisualization$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["GlobeVisualization"](canvasRef.current);
            globeRef.current.setInteractionMode('navigate');
        }
        setIsLoaded(true);
        setStatusText('Manual mode ready. Tectonics engine files are archived.');
        updateVisualizationRef.current();
        const clickHandler = (event)=>onCanvasClickRef.current(event);
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.addEventListener('click', clickHandler);
        }
        return ()=>{
            cancelled = true;
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
            if (canvas) {
                canvas.removeEventListener('click', clickHandler);
            }
        };
    }, []);
    const onSpeedChange = (value)=>{
        const parsed = parseFloat(value);
        simSpeedRef.current = parsed;
        setSimSpeed(parsed);
    };
    const onPlay = ()=>{
        if (!isSetupCompleteRef.current) {
            setStatusText('Finish setup before playing the simulation.');
            return;
        }
        isPlayingRef.current = false;
        setIsPlaying(false);
        setStatusText('Automatic tectonic simulation on Play is disabled for manual workflow.');
    };
    const onPause = ()=>{
        isPlayingRef.current = false;
        setIsPlaying(false);
    };
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
        className: "app-shell",
        children: [
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("canvas", {
                ref: canvasRef,
                id: "canvas"
            }, void 0, false, {
                fileName: "[project]/app/page.jsx",
                lineNumber: 824,
                columnNumber: 7
            }, this),
            !isLoaded && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                className: "loading-overlay",
                children: "Loading manual workspace..."
            }, void 0, false, {
                fileName: "[project]/app/page.jsx",
                lineNumber: 826,
                columnNumber: 21
            }, this),
            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                id: "ui-overlay",
                children: [
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                        className: "panel controls-panel",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("header", {
                                className: "panel-header",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layers$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Layers$3e$__["Layers"], {
                                                size: 16
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 832,
                                                columnNumber: 15
                                            }, this),
                                            "Simulation Controls"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 831,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: `mode-pill mode-${interactionMode}`,
                                        children: [
                                            interactionMode === 'navigate' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$compass$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Compass$3e$__["Compass"], {
                                                size: 14
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 836,
                                                columnNumber: 50
                                            }, this),
                                            interactionMode === 'draw' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pencil$2d$line$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PencilLine$3e$__["PencilLine"], {
                                                size: 14
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 837,
                                                columnNumber: 46
                                            }, this),
                                            interactionMode === 'mark' && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__["MapPin"], {
                                                size: 14
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 838,
                                                columnNumber: 46
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                children: [
                                                    interactionMode === 'navigate' && 'Navigate',
                                                    interactionMode === 'draw' && 'Draw Supercontinent',
                                                    interactionMode === 'mark' && 'Mark Cratons'
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 839,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 835,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/page.jsx",
                                lineNumber: 830,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "control-section",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                        children: "Step 1: Draw Supercontinent"
                                    }, void 0, false, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 848,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "btn-row",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn",
                                                onClick: startDrawing,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pencil$2d$line$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__PencilLine$3e$__["PencilLine"], {
                                                        size: 14
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 851,
                                                        columnNumber: 17
                                                    }, this),
                                                    "Start Drawing"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 850,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn btn-subtle",
                                                onClick: clearDrawing,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                                        size: 14
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 855,
                                                        columnNumber: 17
                                                    }, this),
                                                    "Clear"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 854,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 849,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/page.jsx",
                                lineNumber: 847,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "control-section",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                        children: "Step 2: Mark Cratons"
                                    }, void 0, false, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 862,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        className: "btn",
                                        onClick: startMarkingCratons,
                                        disabled: !hasSupercontinent,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$map$2d$pin$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MapPin$3e$__["MapPin"], {
                                                size: 14
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 864,
                                                columnNumber: 15
                                            }, this),
                                            "Mark Cratons"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 863,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "btn-row",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn",
                                                onClick: saveCurrentCratonPolygon,
                                                disabled: !canSaveCraton,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$save$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Save$3e$__["Save"], {
                                                        size: 14
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 869,
                                                        columnNumber: 17
                                                    }, this),
                                                    "Save Draft"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 868,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn btn-subtle",
                                                onClick: clearCurrentCratonDraft,
                                                disabled: interactionMode !== 'mark' || !hasCratonDraft,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$trash$2d$2$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Trash2$3e$__["Trash2"], {
                                                        size: 14
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 877,
                                                        columnNumber: 17
                                                    }, this),
                                                    "Clear Draft"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 872,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 867,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        className: "btn btn-accent",
                                        onClick: finishSetup,
                                        disabled: !hasSupercontinent,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2d$check$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__CheckCircle2$3e$__["CheckCircle2"], {
                                                size: 14
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 882,
                                                columnNumber: 15
                                            }, this),
                                            "Finish Setup"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 881,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                        className: "btn btn-subtle",
                                        onClick: ()=>{
                                            void exportCurrentGpml();
                                        },
                                        disabled: !hasSupercontinent || isSavingGpml,
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$save$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Save$3e$__["Save"], {
                                                size: 14
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 892,
                                                columnNumber: 15
                                            }, this),
                                            isSavingGpml ? 'Saving GPML...' : 'Save GPML In Project'
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 885,
                                        columnNumber: 13
                                    }, this),
                                    lastGpmlFileName && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "hint",
                                        children: [
                                            "Saved: /gpml/",
                                            lastGpmlFileName,
                                            " (current: /gpml/current.gpml)"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 895,
                                        columnNumber: 34
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/page.jsx",
                                lineNumber: 861,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "control-section",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h3", {
                                        children: "Simulation"
                                    }, void 0, false, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 899,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("label", {
                                        className: "slider-label",
                                        children: [
                                            "Speed: ",
                                            simSpeed.toFixed(1),
                                            " Myr/frame"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 900,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "range",
                                        min: "0.5",
                                        max: "50",
                                        step: "0.5",
                                        value: simSpeed,
                                        onChange: (e)=>onSpeedChange(e.target.value)
                                    }, void 0, false, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 901,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "btn-row",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn",
                                                onClick: onPlay,
                                                disabled: !isSetupComplete || isPlaying,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$play$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Play$3e$__["Play"], {
                                                        size: 14
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 911,
                                                        columnNumber: 17
                                                    }, this),
                                                    "Play"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 910,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn",
                                                onClick: onPause,
                                                disabled: !isSetupComplete || !isPlaying,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$pause$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Pause$3e$__["Pause"], {
                                                        size: 14
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 915,
                                                        columnNumber: 17
                                                    }, this),
                                                    "Pause"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 914,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn btn-subtle",
                                                onClick: resetSimulation,
                                                children: [
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__["RotateCcw"], {
                                                        size: 14
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 919,
                                                        columnNumber: 17
                                                    }, this),
                                                    "Reset"
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 918,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 909,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/page.jsx",
                                lineNumber: 898,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                className: "status-box",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$circle$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Circle$3e$__["Circle"], {
                                        size: 12
                                    }, void 0, false, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 926,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                        children: statusText
                                    }, void 0, false, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 927,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/page.jsx",
                                lineNumber: 925,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/page.jsx",
                        lineNumber: 829,
                        columnNumber: 9
                    }, this),
                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("aside", {
                        className: "right-stack",
                        children: [
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: "panel data-panel",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eye$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Eye$3e$__["Eye"], {
                                                size: 16
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 934,
                                                columnNumber: 15
                                            }, this),
                                            "Tectonic Data"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 933,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "stats-grid",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    "Time ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: [
                                                            simTime.toFixed(1),
                                                            " Mya"
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 939,
                                                        columnNumber: 22
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 938,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    "Phase ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: phaseText
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 942,
                                                        columnNumber: 23
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 941,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    "Plates ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: stats.plates
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 945,
                                                        columnNumber: 24
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 944,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    "Subduction ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: stats.subzones
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 948,
                                                        columnNumber: 28
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 947,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    "Rift Zones ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: stats.rifts
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 951,
                                                        columnNumber: 28
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 950,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    "Collisions ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: stats.collisions
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 954,
                                                        columnNumber: 28
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 953,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    "Cratons ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: stats.cratons
                                                    }, void 0, false, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 957,
                                                        columnNumber: 25
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 956,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                children: [
                                                    "Plumes/Sutures ",
                                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("strong", {
                                                        children: [
                                                            stats.plumes,
                                                            " / ",
                                                            stats.sutures
                                                        ]
                                                    }, void 0, true, {
                                                        fileName: "[project]/app/page.jsx",
                                                        lineNumber: 960,
                                                        columnNumber: 32
                                                    }, this)
                                                ]
                                            }, void 0, true, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 959,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 937,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/page.jsx",
                                lineNumber: 932,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: "panel view-panel",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$compass$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Compass$3e$__["Compass"], {
                                                size: 16
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 967,
                                                columnNumber: 15
                                            }, this),
                                            "View Controls"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 966,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "hint",
                                        children: "Navigate: left drag. Draw mode: right or middle drag, or Shift + left drag."
                                    }, void 0, false, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 970,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "nav-grid",
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn-icon",
                                                onClick: ()=>globeRef.current?.nudgeView(0, 1),
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$move$2d$up$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MoveUp$3e$__["MoveUp"], {
                                                    size: 15
                                                }, void 0, false, {
                                                    fileName: "[project]/app/page.jsx",
                                                    lineNumber: 975,
                                                    columnNumber: 17
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 974,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn-icon",
                                                onClick: ()=>globeRef.current?.resetView(),
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$rotate$2d$ccw$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__RotateCcw$3e$__["RotateCcw"], {
                                                    size: 15
                                                }, void 0, false, {
                                                    fileName: "[project]/app/page.jsx",
                                                    lineNumber: 978,
                                                    columnNumber: 17
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 977,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn-icon",
                                                onClick: ()=>globeRef.current?.zoomBy(-0.14),
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$zoom$2d$in$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ZoomIn$3e$__["ZoomIn"], {
                                                    size: 15
                                                }, void 0, false, {
                                                    fileName: "[project]/app/page.jsx",
                                                    lineNumber: 981,
                                                    columnNumber: 17
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 980,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn-icon",
                                                onClick: ()=>globeRef.current?.nudgeView(-1, 0),
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$move$2d$left$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MoveLeft$3e$__["MoveLeft"], {
                                                    size: 15
                                                }, void 0, false, {
                                                    fileName: "[project]/app/page.jsx",
                                                    lineNumber: 985,
                                                    columnNumber: 17
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 984,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn-icon",
                                                onClick: ()=>globeRef.current?.resetPitch(),
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$compass$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Compass$3e$__["Compass"], {
                                                    size: 15
                                                }, void 0, false, {
                                                    fileName: "[project]/app/page.jsx",
                                                    lineNumber: 988,
                                                    columnNumber: 17
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 987,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn-icon",
                                                onClick: ()=>globeRef.current?.nudgeView(1, 0),
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$move$2d$right$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MoveRight$3e$__["MoveRight"], {
                                                    size: 15
                                                }, void 0, false, {
                                                    fileName: "[project]/app/page.jsx",
                                                    lineNumber: 991,
                                                    columnNumber: 17
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 990,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn-icon",
                                                onClick: ()=>globeRef.current?.nudgeView(0, -1),
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$move$2d$down$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__MoveDown$3e$__["MoveDown"], {
                                                    size: 15
                                                }, void 0, false, {
                                                    fileName: "[project]/app/page.jsx",
                                                    lineNumber: 995,
                                                    columnNumber: 17
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 994,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn-icon",
                                                onClick: ()=>globeRef.current?.zoomBy(0.14),
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$zoom$2d$out$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__ZoomOut$3e$__["ZoomOut"], {
                                                    size: 15
                                                }, void 0, false, {
                                                    fileName: "[project]/app/page.jsx",
                                                    lineNumber: 998,
                                                    columnNumber: 17
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 997,
                                                columnNumber: 15
                                            }, this),
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("button", {
                                                className: "btn-icon",
                                                onClick: ()=>globeRef.current?.resetView(),
                                                children: /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$eye$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Eye$3e$__["Eye"], {
                                                    size: 15
                                                }, void 0, false, {
                                                    fileName: "[project]/app/page.jsx",
                                                    lineNumber: 1001,
                                                    columnNumber: 17
                                                }, this)
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 1000,
                                                columnNumber: 15
                                            }, this)
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 973,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/page.jsx",
                                lineNumber: 965,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: "panel outliner-panel",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$layers$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Layers$3e$__["Layers"], {
                                                size: 16
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 1008,
                                                columnNumber: 15
                                            }, this),
                                            "Polygon Outliner"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 1007,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "outliner-list",
                                        children: [
                                            outlinerRows.length === 0 && /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                className: "outliner-empty",
                                                children: "No polygons yet. Draw supercontinent first."
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 1012,
                                                columnNumber: 45
                                            }, this),
                                            outlinerRows.map((row)=>/*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                    className: "outliner-item",
                                                    children: [
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("span", {
                                                            className: "outliner-color",
                                                            style: {
                                                                backgroundColor: row.color
                                                            }
                                                        }, void 0, false, {
                                                            fileName: "[project]/app/page.jsx",
                                                            lineNumber: 1015,
                                                            columnNumber: 19
                                                        }, this),
                                                        /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                            className: "outliner-copy",
                                                            children: [
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "outliner-title",
                                                                    children: row.label
                                                                }, void 0, false, {
                                                                    fileName: "[project]/app/page.jsx",
                                                                    lineNumber: 1017,
                                                                    columnNumber: 21
                                                                }, this),
                                                                /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                                                    className: "outliner-meta",
                                                                    children: row.meta
                                                                }, void 0, false, {
                                                                    fileName: "[project]/app/page.jsx",
                                                                    lineNumber: 1018,
                                                                    columnNumber: 21
                                                                }, this)
                                                            ]
                                                        }, void 0, true, {
                                                            fileName: "[project]/app/page.jsx",
                                                            lineNumber: 1016,
                                                            columnNumber: 19
                                                        }, this)
                                                    ]
                                                }, row.key, true, {
                                                    fileName: "[project]/app/page.jsx",
                                                    lineNumber: 1014,
                                                    columnNumber: 17
                                                }, this))
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 1011,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/page.jsx",
                                lineNumber: 1006,
                                columnNumber: 11
                            }, this),
                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("section", {
                                className: "panel playback-panel",
                                children: [
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("h2", {
                                        children: [
                                            /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$lucide$2d$react$2f$dist$2f$esm$2f$icons$2f$clock$2d$3$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__$3c$export__default__as__Clock3$3e$__["Clock3"], {
                                                size: 16
                                            }, void 0, false, {
                                                fileName: "[project]/app/page.jsx",
                                                lineNumber: 1027,
                                                columnNumber: 15
                                            }, this),
                                            "Time Control"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 1026,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("div", {
                                        className: "time-readout",
                                        children: [
                                            simTime.toFixed(1),
                                            " Mya"
                                        ]
                                    }, void 0, true, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 1030,
                                        columnNumber: 13
                                    }, this),
                                    /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$ssr$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$ssr$5d$__$28$ecmascript$29$__["jsxDEV"])("input", {
                                        type: "range",
                                        min: "0",
                                        max: Math.max(1000, simTime + 100),
                                        value: simTime,
                                        step: "1",
                                        onChange: (e)=>jumpToTime(e.target.value)
                                    }, void 0, false, {
                                        fileName: "[project]/app/page.jsx",
                                        lineNumber: 1031,
                                        columnNumber: 13
                                    }, this)
                                ]
                            }, void 0, true, {
                                fileName: "[project]/app/page.jsx",
                                lineNumber: 1025,
                                columnNumber: 11
                            }, this)
                        ]
                    }, void 0, true, {
                        fileName: "[project]/app/page.jsx",
                        lineNumber: 931,
                        columnNumber: 9
                    }, this)
                ]
            }, void 0, true, {
                fileName: "[project]/app/page.jsx",
                lineNumber: 828,
                columnNumber: 7
            }, this)
        ]
    }, void 0, true, {
        fileName: "[project]/app/page.jsx",
        lineNumber: 823,
        columnNumber: 5
    }, this);
}
}),
];

//# sourceMappingURL=_0u8ew2e._.js.map