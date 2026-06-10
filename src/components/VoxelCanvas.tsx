/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { BlockType, Vector3D, Particle, GameStats } from '../types';
import { VoxelWorld, BLOCK_DEFINITIONS } from '../world';
import { VoxelPhysics } from '../physics';
import { getProceduralTexture } from '../textures';
import { audio } from '../audio';

interface VoxelCanvasProps {
  world: VoxelWorld;
  physics: VoxelPhysics;
  activeItem: BlockType;
  gameMode: 'survival' | 'creative';
  flying: boolean;
  onUpdateHUD: (data: {
    isGrounded: boolean;
    position: Vector3D;
    breakProgress: number;
    activeBlockTarget: { x: number; y: number; z: number; type: BlockType } | null;
  }) => void;
  inventory: Record<BlockType, number>;
  onIncrementBlockCount: (type: BlockType, count: number) => void;
  virtualInputs: {
    forward: number;
    strafe: number;
    jump: boolean;
    breakBlock: boolean;
    placeBlock: boolean;
  };
  timeOfDay: number; // 0 to 1
  onRef: (ref: { resetPlayerPos: () => void }) => void;
}

export const VoxelCanvas: React.FC<VoxelCanvasProps> = ({
  world,
  physics,
  activeItem,
  gameMode,
  flying,
  onUpdateHUD,
  inventory,
  onIncrementBlockCount,
  virtualInputs,
  timeOfDay,
  onRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Synchronize highly dynamic props using Refs to avoid re-triggering the Three.js setup effect
  const worldRef = useRef(world);
  const physicsRef = useRef(physics);
  const activeItemRef = useRef(activeItem);
  const gameModeRef = useRef(gameMode);
  const flyingRef = useRef(flying);
  const inventoryRef = useRef(inventory);
  const timeOfDayRef = useRef(timeOfDay);
  const virtualInputsRef = useRef(virtualInputs);
  const onUpdateHUDRef = useRef(onUpdateHUD);
  const onIncrementBlockCountRef = useRef(onIncrementBlockCount);

  // Sync refs on render
  useEffect(() => { worldRef.current = world; }, [world]);
  useEffect(() => { physicsRef.current = physics; }, [physics]);
  useEffect(() => { activeItemRef.current = activeItem; }, [activeItem]);
  useEffect(() => { gameModeRef.current = gameMode; }, [gameMode]);
  useEffect(() => { flyingRef.current = flying; }, [flying]);
  useEffect(() => { inventoryRef.current = inventory; }, [inventory]);
  useEffect(() => { timeOfDayRef.current = timeOfDay; }, [timeOfDay]);
  useEffect(() => { virtualInputsRef.current = virtualInputs; }, [virtualInputs]);
  useEffect(() => { onUpdateHUDRef.current = onUpdateHUD; }, [onUpdateHUD]);
  useEffect(() => { onIncrementBlockCountRef.current = onIncrementBlockCount; }, [onIncrementBlockCount]);

  // States & Refs for camera looking orientation
  const playerPos = useRef<Vector3D>({ x: world.widthX / 2, y: world.heightY + 2, z: world.depthZ / 2 });
  const playerVel = useRef<Vector3D>({ x: 0, y: 0, z: 0 });
  const playerYaw = useRef<number>(0);   // Horizontal mouse rotate (radians)
  const playerPitch = useRef<number>(0); // Vertical mouse rotate (radians)

  // Tracking dynamic click drags (for seamless looking inside frames & touch pads)
  const isDragging = useRef<boolean>(false);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const mouseDownPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDragLooking = useRef<boolean>(false);
  const isLeftMouseDown = useRef<boolean>(false);
  const isRightMouseDown = useRef<boolean>(false);

  // Key states map
  const keysActive = useRef<Record<string, boolean>>({});

  // Core Three.js references
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const voxelMeshesGroupRef = useRef<THREE.Group | null>(null);
  
  // Highlighting wireframes
  const targetHighlightRef = useRef<THREE.BoxHelper | null>(null);
  const previewHighlightRef = useRef<THREE.BoxHelper | null>(null);
  
  // Interactive breaking timers
  const targetVoxel = useRef<{ x: number; y: number; z: number; type: BlockType } | null>(null);
  const targetBreakTimer = useRef<number>(0); // milliseconds accumulated
  const isBreakingTriggered = useRef<boolean>(false);

  // Dynamic mesh map for O(1) removals: coordinate string -> Mesh
  const meshRecord = useRef<Record<string, THREE.Mesh>>({});
  
  // Ambient stars Group
  const starsGroupRef = useRef<THREE.Points | null>(null);

  // Textures and Materials library caching
  const materialsCache = useRef<Record<number, THREE.Material | THREE.Material[]>>({});

  // Particle list
  const activeParticles = useRef<{ mesh: THREE.Mesh; vel: [number, number, number]; life: number }[]>([]);

  // Sound stride controller
  const stepIntervalTimer = useRef<number>(0);

  // 1. Texture Generation Cache initializers
  const getBlockMaterials = (type: BlockType): THREE.Material[] | THREE.Material => {
    if (materialsCache.current[type]) {
      return materialsCache.current[type];
    }

    const bDef = BLOCK_DEFINITIONS[type];
    if (type === BlockType.AIR) {
      return new THREE.MeshBasicMaterial({ visible: false });
    }

    // Custom multi-face setups
    if (type === BlockType.GRASS) {
      const topTex = getProceduralTexture('grass_top', '#5e942f', { pattern: 'speckled', blendColor: '#4b7524' });
      const sideTex = getProceduralTexture('grass_side', '#866043', { pattern: 'speckled' }); // we could blend green top and brown bottom, but brown base is nice
      const bottomTex = getProceduralTexture('dirt', '#866043', { pattern: 'speckled' });

      const sideMat = new THREE.MeshLambertMaterial({ map: sideTex });
      const topMat = new THREE.MeshLambertMaterial({ map: topTex });
      const bottomMat = new THREE.MeshLambertMaterial({ map: bottomTex });

      // Order in THREE: +X (right), -X (left), +Y (top), -Y (bottom), +Z (front), -Z (back)
      const mats = [sideMat, sideMat, topMat, bottomMat, sideMat, sideMat];
      materialsCache.current[type] = mats;
      return mats;
    }

    if (type === BlockType.WOOD_LOG) {
      const ringTex = getProceduralTexture('log_top', '#d7bc8d', { pattern: 'rings', noiseIntensity: 0.1 });
      const barkTex = getProceduralTexture('log_side', '#5c4033', { pattern: 'bark', noiseIntensity: 0.2 });

      const barkMat = new THREE.MeshLambertMaterial({ map: barkTex });
      const ringMat = new THREE.MeshLambertMaterial({ map: ringTex });

      const mats = [barkMat, barkMat, ringMat, ringMat, barkMat, barkMat];
      materialsCache.current[type] = mats;
      return mats;
    }

    // Glass special material
    if (type === BlockType.GLASS) {
      const glassTex = getProceduralTexture('glass', '#e0f7fa', { pattern: 'glass' });
      const mat = new THREE.MeshLambertMaterial({
        map: glassTex,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      });
      materialsCache.current[type] = mat;
      return mat;
    }

    // Other blocks (Stone, Dirt, Planks, Leaves, Cobble)
    let pattern: 'pattern' | 'speckled' | 'planks' | 'cobble' | 'blank' = 'speckled';
    if (type === BlockType.PLANK) pattern = 'planks';
    if (type === BlockType.COBBLESTONE) pattern = 'cobble';
    if (type === BlockType.LEAVES) pattern = 'speckled';

    const tex = getProceduralTexture(bDef.name, bDef.color, {
      pattern: pattern as any,
      noiseIntensity: type === BlockType.LEAVES ? 0.25 : 0.12,
    });

    const mat = new THREE.MeshLambertMaterial({
      map: tex,
      transparent: bDef.isTransparent,
      side: bDef.isTransparent ? THREE.DoubleSide : THREE.FrontSide,
    });

    materialsCache.current[type] = mat;
    return mat;
  };

  /**
   * Helper resets dynamic players coordinates back onto safety top voxel
   */
  const handleResetPos = () => {
    const rx = Math.floor(worldRef.current.widthX / 2);
    const rz = Math.floor(worldRef.current.depthZ / 2);
    let ry = worldRef.current.heightY - 1;
    // Walk down to find topmost solid
    for (let y = worldRef.current.heightY - 1; y >= 0; y--) {
      if (worldRef.current.isSolid(rx, y, rz)) {
        ry = y + 1;
        break;
      }
    }
    playerPos.current = { x: rx + 0.5, y: ry + 0.1, z: rz + 0.5 };
    playerVel.current = { x: 0, y: 0, z: 0 };
    if (cameraRef.current) {
      cameraRef.current.position.set(playerPos.current.x, playerPos.current.y + 1.5, playerPos.current.z);
    }
  };

  useEffect(() => {
    onRef({ resetPlayerPos: handleResetPos });
  }, [onRef]);

  // Main system initialization
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    // A. SETUP ENGINE
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // WebGL config
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: false, // retro feel
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    rendererRef.current = renderer;

    const camera = new THREE.PerspectiveCamera(
      75,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      100
    );
    camera.rotation.order = 'YXZ';
    // Initialize initial camera height adjusted for eyes (~+1.5m above feet pos)
    camera.position.set(playerPos.current.x, playerPos.current.y + 1.5, playerPos.current.z);
    cameraRef.current = camera;

    // B. ADD GROUPS & LIGHTS
    const voxelGroup = new THREE.Group();
    scene.add(voxelGroup);
    voxelMeshesGroupRef.current = voxelGroup;

    // Warm Ambient sunlight
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.85);
    dirLight.position.set(10, 25, 15);
    scene.add(dirLight);

    // C. WIREFRAME OUTLINE TARGET BOXES
    const targetGeom = new THREE.BoxGeometry(1.006, 1.006, 1.006);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, visible: false });
    const targetIndicatorMesh = new THREE.Mesh(targetGeom, wireMat);
    scene.add(targetIndicatorMesh);

    const targetOutline = new THREE.BoxHelper(targetIndicatorMesh, 0xffff00);
    targetOutline.visible = false;
    scene.add(targetOutline);
    targetHighlightRef.current = targetOutline;

    // Green placing wireframe target
    const previewGeom = new THREE.BoxGeometry(0.999, 0.999, 0.999);
    const pWireMat = new THREE.MeshBasicMaterial({ color: 0x2eec71, wireframe: true, visible: false });
    const previewIndicatorMesh = new THREE.Mesh(previewGeom, pWireMat);
    scene.add(previewIndicatorMesh);

    const previewOutline = new THREE.BoxHelper(previewIndicatorMesh, 0x2ecc71);
    previewOutline.visible = false;
    scene.add(previewOutline);
    previewHighlightRef.current = previewOutline;

    // D. SYSTEM STARS (for beautiful night time)
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 350;
    const starPositions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i += 3) {
      // Random hemisphere distribution high above
      const radius = 60 + Math.random() * 20;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos((Math.random() * 0.9) + 0.1); // upper sky only

      starPositions[i] = radius * Math.sin(phi) * Math.cos(theta);
      starPositions[i + 1] = radius * Math.cos(phi) + 10;
      starPositions[i + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.35,
      transparent: true,
      opacity: 0,
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    scene.add(stars);
    starsGroupRef.current = stars;

    // E. PRE-GENERATE ALL VISIBLE VOXELS (Neighbor-Visiblity optimized allocation)
    const isVoxelExposedToAir = (x: number, y: number, z: number): boolean => {
      // Exposed if next to boundaries or any air / transparent neighbors
      const neighbors = [
        { x: x + 1, y, z },
        { x: x - 1, y, z },
        { x, y: y + 1, z },
        { x, y: y - 1, z },
        { x, y, z: z + 1 },
        { x, y, z: z - 1 },
      ];
      for (const n of neighbors) {
        if (worldRef.current.outOfBounds(n.x, n.y, n.z)) return true;
        const b = worldRef.current.getBlock(n.x, n.y, n.z);
        if (b === BlockType.AIR || BLOCK_DEFINITIONS[b]?.isTransparent) {
          return true;
        }
      }
      return false;
    };

    const constructWorldVoxelMeshes = () => {
      // Clear anything existing safely
      Object.keys(meshRecord.current).forEach(key => {
        const m = meshRecord.current[key];
        voxelGroup.remove(m);
      });
      meshRecord.current = {};

      const cachedBoxGeom = new THREE.BoxGeometry(1, 1, 1);

      for (let x = 0; x < worldRef.current.widthX; x++) {
        for (let y = 0; y < worldRef.current.heightY; y++) {
          for (let z = 0; z < worldRef.current.depthZ; z++) {
            const b = worldRef.current.getBlock(x, y, z);
            if (b !== BlockType.AIR) {
              if (isVoxelExposedToAir(x, y, z)) {
                buildVoxelMesh(x, y, z, b, cachedBoxGeom);
              }
            }
          }
        }
      }
    };

    const buildVoxelMesh = (x: number, y: number, z: number, type: BlockType, geom: THREE.BoxGeometry) => {
      const mats = getBlockMaterials(type);
      const mesh = new THREE.Mesh(geom, mats);
      mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
      voxelGroup.add(mesh);
      meshRecord.current[`${x}_${y}_${z}`] = mesh;
    };

    constructWorldVoxelMeshes();

    // F. USER INPUT LISTENERS
    const handleKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      keysActive.current[code] = true;

      // Slot selections (1 to 9)
      if (e.key >= '1' && e.key <= '9') {
        const index = parseInt(e.key) - 1;
        // Broadcast selected slot back via trigger event
        const numEvent = new CustomEvent('hotbar_set_slot', { detail: index });
        window.dispatchEvent(numEvent);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      keysActive.current[code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Camera move drag look listeners (essential for frame-locked and touch lookups)
    const handleMouseDown = (e: MouseEvent) => {
      if (e.target !== canvasRef.current) return;
      isDragging.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      mouseDownPos.current = { x: e.clientX, y: e.clientY };
      isDragLooking.current = false;

      // Register the clicks immediately to make tap blocks extremely snappy
      if (e.button === 0) {
        isLeftMouseDown.current = true;
      } else if (e.button === 2) {
        isRightMouseDown.current = true;
      }

      // Try acquiring pointer lock for standard FPS feel
      canvasRef.current.requestPointerLock?.();
    };

    const handleMouseMove = (e: MouseEvent) => {
      // If pointerLocked, use raw deltas. Otherwise use drag coordinates.
      const isPointerLocked = document.pointerLockElement === canvasRef.current;

      if (isPointerLocked) {
        const mouseSensitivity = 0.0025;
        playerYaw.current -= e.movementX * mouseSensitivity;
        playerPitch.current -= e.movementY * mouseSensitivity;

        const maxPitch = Math.PI / 2 - 0.03;
        playerPitch.current = Math.max(-maxPitch, Math.min(maxPitch, playerPitch.current));
      } else if (isDragging.current) {
        // Calculate the vector length from where we pressed down
        const dist = Math.hypot(e.clientX - mouseDownPos.current.x, e.clientY - mouseDownPos.current.y);
        
        // If they dragged more than 15px, they are definitely looking around, not trying to tap a block.
        // Immediately de-activate the clicks to save blocks from getting broken/placed by mistake!
        if (dist > 15) {
          isDragLooking.current = true;
          isLeftMouseDown.current = false;
          isRightMouseDown.current = false;
        }

        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        lastMousePos.current = { x: e.clientX, y: e.clientY };

        const dragSensitivity = 0.0065;
        playerYaw.current -= dx * dragSensitivity;
        playerPitch.current -= dy * dragSensitivity;

        const maxPitch = Math.PI / 2 - 0.03;
        playerPitch.current = Math.max(-maxPitch, Math.min(maxPitch, playerPitch.current));
      }
    };

    const handleMouseUp = (e: MouseEvent | TouchEvent) => {
      isDragging.current = false;
      isDragLooking.current = false;
      if (e && 'button' in e) {
        if (e.button === 0) {
          isLeftMouseDown.current = false;
        } else if (e.button === 2) {
          isRightMouseDown.current = false;
        }
      } else {
        // Reset both on touch and general releases
        isLeftMouseDown.current = false;
        isRightMouseDown.current = false;
      }
    };

    // Listen to page-wide mouseup to prevent sticky movements
    window.addEventListener('mouseup', handleMouseUp);
    canvasRef.current.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);

    // Handle touch looking (for mobile / screen tap panels)
    const handleTouchStart = (e: TouchEvent) => {
      if (e.target !== canvasRef.current) return;
      isDragging.current = true;
      const t = e.touches[0];
      lastMousePos.current = { x: t.clientX, y: t.clientY };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || e.touches.length === 0) return;
      const t = e.touches[0];
      const dx = t.clientX - lastMousePos.current.x;
      const dy = t.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: t.clientX, y: t.clientY };

      const touchSensitivity = 0.012; // slightly faster for touch flicks
      playerYaw.current -= dx * touchSensitivity;
      playerPitch.current -= dy * touchSensitivity;

      const maxPitch = Math.PI / 2 - 0.03;
      playerPitch.current = Math.max(-maxPitch, Math.min(maxPitch, playerPitch.current));
    };

    canvasRef.current.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvasRef.current.addEventListener('touchmove', handleTouchMove, { passive: true });
    canvasRef.current.addEventListener('touchend', handleMouseUp);

    // Prevent default right clicks to enable seamless placing
    const preventContextMenu = (e: Event) => e.preventDefault();
    canvasRef.current.addEventListener('contextmenu', preventContextMenu);

    // G. RESIZE ENGINE
    const handleResize = () => {
      if (!containerRef.current || !renderer || !camera) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.current);

    // H. SEEDED TICK FOR MANUAL EXPOSURE REDRAW ON BLOCK CHUTES
    const reconstructNeighborMeshes = (x: number, y: number, z: number) => {
      const neighbors = [
        { x: x + 1, y, z },
        { x: x - 1, y, z },
        { x, y: y + 1, z },
        { x, y: y - 1, z },
        { x, y, z: z + 1 },
        { x, y, z: z - 1 },
      ];

      const boxGeom = new THREE.BoxGeometry(1, 1, 1);

      neighbors.forEach(n => {
        if (worldRef.current.outOfBounds(n.x, n.y, n.z)) return;
        const b = worldRef.current.getBlock(n.x, n.y, n.z);
        const mKey = `${n.x}_${n.y}_${n.z}`;
        
        if (b === BlockType.AIR) {
          // If neighbor became AIR, delete its mesh (usually nothing to delete)
          if (meshRecord.current[mKey]) {
            voxelGroup.remove(meshRecord.current[mKey]);
            delete meshRecord.current[mKey];
          }
        } else {
          // Verify if neighbor should be visible / drawn
          const isExposed = isVoxelExposedToAir(n.x, n.y, n.z);
          const hasMesh = !!meshRecord.current[mKey];

          if (isExposed && !hasMesh) {
            buildVoxelMesh(n.x, n.y, n.z, b, boxGeom);
          } else if (!isExposed && hasMesh) {
            voxelGroup.remove(meshRecord.current[mKey]);
            delete meshRecord.current[mKey];
          }
        }
      });
    };

    // Particles trigger helper
    const spawnBreakDebris = (pos: [number, number, number], bColor: string) => {
      const debrisCount = 12;
      const geom = new THREE.BoxGeometry(0.12, 0.12, 0.12);
      const mat = new THREE.MeshBasicMaterial({ color: bColor });

      for (let i = 0; i < debrisCount; i++) {
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(
          pos[0] + (Math.random() - 0.5) * 0.7,
          pos[1] + (Math.random() - 0.5) * 0.7,
          pos[2] + (Math.random() - 0.5) * 0.7
        );
        scene.add(mesh);

        const velocity: [number, number, number] = [
          (Math.random() - 0.5) * 5.0,
          3.0 + Math.random() * 4.0,
          (Math.random() - 0.5) * 5.0,
        ];

        activeParticles.current.push({
          mesh,
          vel: velocity,
          life: 1.0,
        });
      }
    };

    // I. GAME LOOP EXECUTOR
    let lastTime = performance.now();
    let frameId: number;

    const gameLoop = (timeNow: number) => {
      frameId = requestAnimationFrame(gameLoop);

      let dt = (timeNow - lastTime) / 1000;
      if (dt > 0.1) dt = 0.1; // cap frame drop spikes
      lastTime = timeNow;

      // 1. Gather Inputs (Keyboard keys mapping)
      const inputs = {
        forward: keysActive.current['KeyW'] || keysActive.current['ArrowUp'] ? 1 : (keysActive.current['KeyS'] || keysActive.current['ArrowDown'] ? -1 : virtualInputsRef.current.forward),
        strafe: keysActive.current['KeyD'] || keysActive.current['ArrowRight'] ? 1 : (keysActive.current['KeyA'] || keysActive.current['ArrowLeft'] ? -1 : virtualInputsRef.current.strafe),
        jump: !!keysActive.current['Space'] || virtualInputsRef.current.jump,
        breakBlock: !!keysActive.current['KeyQ'] || virtualInputsRef.current.breakBlock || isLeftMouseDown.current,
        placeBlock: !!keysActive.current['KeyE'] || virtualInputsRef.current.placeBlock || isRightMouseDown.current,
      };

      // 2. Physics & Stride step logic
      const result = physicsRef.current.update(
        playerPos.current,
        playerVel.current,
        inputs,
        playerYaw.current,
        worldRef.current,
        dt,
        flyingRef.current
      );
      
      playerPos.current = result.nextPos;
      playerVel.current = result.nextVel;

      // Stride sound trigger
      if (result.isGrounded && (inputs.forward !== 0 || inputs.strafe !== 0) && !flyingRef.current) {
        stepIntervalTimer.current += dt;
        if (stepIntervalTimer.current > 0.38) { // standard walking cadence
          audio.playStep();
          stepIntervalTimer.current = 0;
        }
      } else {
        stepIntervalTimer.current = 0;
      }

      // Sync Camera Rig
      camera.position.set(playerPos.current.x, playerPos.current.y + 1.45, playerPos.current.z);
      camera.rotation.set(playerPitch.current, playerYaw.current, 0, 'YXZ');

      // 3. Sky Cycle (Ambient Color changes)
      let skyHue = 0.55; // standard blue cyan
      let skySat = 0.75;
      let skyLight = 0.8;
      let lightIntensity = 0.95;

      // Map timeOfDay (0 to 1)
      const PI2 = Math.PI * 2;
      const tAngle = timeOfDayRef.current * PI2;
      const cosTime = Math.sin(tAngle); // High positive-noon, deep negative-midnight

      if (cosTime > 0.15) {
        // Noon daytime
        skyHue = 0.55;
        skyLight = 0.65;
        lightIntensity = 0.9;
        if (stars.material instanceof THREE.PointsMaterial) stars.material.opacity = 0;
      } else if (cosTime <= 0.15 && cosTime > -0.15) {
        // Sunset / Golden dusk transitions
        const factor = (cosTime + 0.15) / 0.3; // 0 to 1
        skyHue = 0.05 + 0.5 * factor; // shifts red/orange to bright blue
        skyLight = 0.2 + 0.45 * factor;
        lightIntensity = 0.15 + 0.75 * factor;
        if (stars.material instanceof THREE.PointsMaterial) stars.material.opacity = (1 - factor) * 0.45;
      } else {
        // Night space black starfield
        skyHue = 0.7;
        skySat = 0.35;
        skyLight = 0.05;
        lightIntensity = 0.15;
        if (stars.material instanceof THREE.PointsMaterial) stars.material.opacity = 0.85;
      }

      const skyColor = new THREE.Color().setHSL(skyHue, skySat, skyLight);
      renderer.setClearColor(skyColor);
      ambientLight.color.setHSL(0.6, 0.4, 0.2 + 0.4 * Math.max(0, cosTime));
      dirLight.color.setHSL(0.1, 0.5, 0.3 + 0.7 * Math.max(0, cosTime));
      dirLight.position.set(15 * Math.sin(tAngle), 25 * Math.cos(tAngle), 10);

      // 4. Update Star rotation softly
      stars.rotation.y += 0.003 * dt;

      // 5. Update Flying debris particles
      for (let i = activeParticles.current.length - 1; i >= 0; i--) {
        const p = activeParticles.current[i];
        p.vel[1] -= physicsRef.current.gravity * dt * 0.5; // gravity pull
        p.mesh.position.x += p.vel[0] * dt;
        p.mesh.position.y += p.vel[1] * dt;
        p.mesh.position.z += p.vel[2] * dt;
        p.life -= dt * 1.5;

        if (p.mesh.material instanceof THREE.Material) {
          p.mesh.material.opacity = p.life;
        }

        if (p.life <= 0) {
          scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          if (p.mesh.material instanceof THREE.Material) p.mesh.material.dispose();
          activeParticles.current.splice(i, 1);
        }
      }

      // 6. RAYCAST TARGET BLOCKS FOR HIT AND PLACES
      const maxReach = 5.2; // Block range reach
      const dirVec = new THREE.Vector3();
      camera.getWorldDirection(dirVec);

      let foundRaycastTarget = false;
      let placeTarget: { x: number; y: number; z: number } | null = null;

      // Segmented iteration is much more lightweight than standard bounding tree checks
      for (let d = 0.1; d <= maxReach; d += 0.04) {
        const rx = playerPos.current.x + dirVec.x * d;
        const ry = (playerPos.current.y + 1.45) + dirVec.y * d; // offset for eyes
        const rz = playerPos.current.z + dirVec.z * d;

        const ix = Math.floor(rx);
        const iy = Math.floor(ry);
        const iz = Math.floor(rz);

        if (worldRef.current.isSolid(ix, iy, iz)) {
          // Block hit! We register targeting markers
          foundRaycastTarget = true;
          
          const hitB = worldRef.current.getBlock(ix, iy, iz);
          const blockDef = BLOCK_DEFINITIONS[hitB];

          if (targetVoxel.current?.x !== ix || targetVoxel.current?.y !== iy || targetVoxel.current?.z !== iz) {
            targetVoxel.current = { x: ix, y: iy, z: iz, type: hitB };
            targetBreakTimer.current = 0;
          }

          // Move Indicators
          targetIndicatorMesh.position.set(ix + 0.5, iy + 0.5, iz + 0.5);
          targetOutline.update();
          targetOutline.visible = true;

          // Determine placing block target position using preceding voxel segment lookup
          const prevX = Math.floor(playerPos.current.x + dirVec.x * (d - 0.07));
          const prevY = Math.floor((playerPos.current.y + 1.45) + dirVec.y * (d - 0.07));
          const prevZ = Math.floor(playerPos.current.z + dirVec.z * (d - 0.07));

          if (!worldRef.current.outOfBounds(prevX, prevY, prevZ) && !worldRef.current.isSolid(prevX, prevY, prevZ)) {
            // Ensure placing wireframe doesn't overlay player feet/eyes geometry directly
            const pxMin = playerPos.current.x - physicsRef.current.playerWidth/2;
            const pxMax = playerPos.current.x + physicsRef.current.playerWidth/2;
            const pyMin = playerPos.current.y;
            const pyMax = playerPos.current.y + physicsRef.current.playerHeight;
            const pzMin = playerPos.current.z - physicsRef.current.playerWidth/2;
            const pzMax = playerPos.current.z + physicsRef.current.playerWidth/2;

            const collideWithPlayerFeet = (prevX >= Math.floor(pxMin) && prevX <= Math.floor(pxMax) &&
                                           prevY >= Math.floor(pyMin) && prevY <= Math.floor(pyMax) &&
                                           prevZ >= Math.floor(pzMin) && prevZ <= Math.floor(pzMax));

            if (!collideWithPlayerFeet) {
              placeTarget = { x: prevX, y: prevY, z: prevZ };
              previewIndicatorMesh.position.set(prevX + 0.5, prevY + 0.5, prevZ + 0.5);
              previewOutline.update();
              previewOutline.visible = true;
            } else {
              previewOutline.visible = false;
            }
          } else {
            previewOutline.visible = false;
          }

          break;
        }
      }

      if (!foundRaycastTarget) {
        targetVoxel.current = null;
        targetBreakTimer.current = 0;
        targetOutline.visible = false;
        previewOutline.visible = false;
      }

      // 7. HANDLE EXPLICIT MINING ACTION (Left Click/Tap holding or breaking indicator)
      let currentMiningPercent = 0;
      const isMining = inputs.breakBlock;

      if (isMining && targetVoxel.current) {
        const activeHit = targetVoxel.current;
        const bDef = BLOCK_DEFINITIONS[activeHit.type];
        const breakRateMultiplier = gameModeRef.current === 'creative' ? 999999 : 1; // Creative cuts instantly

        targetBreakTimer.current += dt * 1000 * breakRateMultiplier;
        currentMiningPercent = Math.min(1.0, targetBreakTimer.current / bDef.breakTimeMs);

        // Slow click ticks for crack audio
        if (Math.floor(targetBreakTimer.current / 160) % 4 === 1 && Math.random() > 0.4) {
          audio.playBreak(bDef.soundType);
        }

        if (targetBreakTimer.current >= bDef.breakTimeMs) {
          // MINED BLOCK SUCCESSFULLY!
          const minedType = activeHit.type;

          worldRef.current.setBlock(activeHit.x, activeHit.y, activeHit.z, BlockType.AIR);
          
          // Delete Mesh
          const keyToRemove = `${activeHit.x}_${activeHit.y}_${activeHit.z}`;
          if (meshRecord.current[keyToRemove]) {
            voxelGroup.remove(meshRecord.current[keyToRemove]);
            delete meshRecord.current[keyToRemove];
          }

          // Trigger Particle Crumbles
          spawnBreakDebris([activeHit.x + 0.5, activeHit.y + 0.5, activeHit.z + 0.5], bDef.color);
          audio.playBreak(bDef.soundType);

          // Redraw surrounding neighbor meshes exposed
          reconstructNeighborMeshes(activeHit.x, activeHit.y, activeHit.z);

          // Update player inventory (only collected if in survival mode)
          if (gameModeRef.current === 'survival') {
            onIncrementBlockCountRef.current(minedType, 1);
          }

          // Clear targets
          targetVoxel.current = null;
          targetBreakTimer.current = 0;
          targetOutline.visible = false;
          previewOutline.visible = false;
        }
      } else {
        targetBreakTimer.current = 0;
      }

      // 8. HANDLE PLACING ACTION (E key tap or virtual controls)
      if (inputs.placeBlock && placeTarget && activeItemRef.current !== BlockType.AIR) {
        // Prevent key spamming by requiring reset key release
        if (!isBreakingTriggered.current) {
          isBreakingTriggered.current = true;

          // Check inventory first if survival
          const curInvCount = inventoryRef.current[activeItemRef.current] || 0;
          if (gameModeRef.current === 'creative' || curInvCount > 0) {
            worldRef.current.setBlock(placeTarget.x, placeTarget.y, placeTarget.z, activeItemRef.current);

            // Dynamically instantiate placed block's Mesh
            const boxGeom = new THREE.BoxGeometry(1, 1, 1);
            buildVoxelMesh(placeTarget.x, placeTarget.y, placeTarget.z, activeItemRef.current, boxGeom);

            const bDef = BLOCK_DEFINITIONS[activeItemRef.current];
            audio.playPlace(bDef.soundType);

            // Reconstruct bounding box checks mapping Neighbor Enclosures
            reconstructNeighborMeshes(placeTarget.x, placeTarget.y, placeTarget.z);

            // Decrement active block
            if (gameModeRef.current === 'survival') {
              onIncrementBlockCountRef.current(activeItemRef.current, -1);
            }
          }
        }
      } else if (!inputs.placeBlock) {
        isBreakingTriggered.current = false;
      }

      // 9. UPDATE INTERFACE HUD OVERLAY
      onUpdateHUDRef.current({
        isGrounded: result.isGrounded,
        position: { x: parseFloat(playerPos.current.x.toFixed(2)), y: parseFloat(playerPos.current.y.toFixed(2)), z: parseFloat(playerPos.current.z.toFixed(2)) },
        breakProgress: currentMiningPercent,
        activeBlockTarget: targetVoxel.current,
      });

      // Render the frame viewport
      renderer.render(scene, camera);
    };

    // Begin looping
    frameId = requestAnimationFrame(gameLoop);

    // I. COMPONENT DISPOSE CLEANUPS
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      
      canvasRef.current?.removeEventListener('mousedown', handleMouseDown);
      canvasRef.current?.removeEventListener('touchstart', handleTouchStart);
      canvasRef.current?.removeEventListener('touchmove', handleTouchMove);
      canvasRef.current?.removeEventListener('touchend', handleMouseUp);
      canvasRef.current?.removeEventListener('contextmenu', preventContextMenu);
      
      resizeObserver.disconnect();

      // Dispose webgl buffers safely to avoid GPU memory leaks
      renderer.dispose();
      voxelGroup.clear();
      scene.clear();
    };
  }, [world, physics]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-sky-200" id="three-container">
      <canvas ref={canvasRef} className="w-full h-full block cursor-crosshair focus:outline-hidden" id="voxel-renderer-canvas" />
    </div>
  );
};
