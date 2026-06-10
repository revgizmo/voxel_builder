/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { BlockType, Vector3D, GameStats, CraftingRecipe } from './types';
import { VoxelWorld } from './world';
import { VoxelPhysics } from './physics';
import { VoxelCanvas } from './components/VoxelCanvas';
import { GameHUD } from './components/GameHUD';
import { audio } from './audio';
import { RotateCcw, Volume2, Sparkles, AlertCircle } from 'lucide-react';

export default function App() {
  // Initialize World & Physics engine once using useMemo to persist across renders
  const world = useMemo(() => new VoxelWorld(40, 16, 40), []);
  const physics = useMemo(() => new VoxelPhysics(), []);

  // Base state hookups
  const [activeItem, setActiveItem] = useState<BlockType>(BlockType.GRASS);
  const [gameMode, setGameMode] = useState<'survival' | 'creative'>('creative');
  const [flying, setFlying] = useState<boolean>(false);
  
  // Starting inventory count (infinite in creative, consumed in survival)
  const [inventory, setInventory] = useState<Record<BlockType, number>>({
    [BlockType.GRASS]: 16,
    [BlockType.DIRT]: 32,
    [BlockType.STONE]: 24,
    [BlockType.WOOD_LOG]: 12,
    [BlockType.LEAVES]: 16,
    [BlockType.PLANK]: 12,
    [BlockType.GLASS]: 8,
    [BlockType.COBBLESTONE]: 16,
    [BlockType.AIR]: 0,
  });

  // Time of Day (0 to 1 loop). Start at 0.35 (gorgeous mid-morning)
  const [timeOfDay, setTimeOfDay] = useState<number>(0.3);
  const [timeFlowPaused, setTimeFlowPaused] = useState<boolean>(false);

  // Stats
  const [position, setPosition] = useState<Vector3D>({ x: 20, y: 7, z: 20 });
  const [isGrounded, setIsGrounded] = useState<boolean>(false);
  const [breakProgress, setBreakProgress] = useState<number>(0);
  const [activeBlockTarget, setActiveBlockTarget] = useState<{ x: number; y: number; z: number; type: BlockType } | null>(null);

  // Virtual controller triggers
  const [virtualInputs, setVirtualInputs] = useState({
    forward: 0,
    strafe: 0,
    jump: false,
    breakBlock: false,
    placeBlock: false,
  });

  // Communication ref to bridge resets back into ThreeJS canvas
  const canvasBridgeRef = useRef<{ resetPlayerPos: () => void } | null>(null);

  // Core automatic Day/Night cycle ticking
  useEffect(() => {
    if (timeFlowPaused) return;

    const interval = setInterval(() => {
      setTimeOfDay(prev => {
        const nextTime = prev + 0.0012; // slow, beautiful celestial movement
        return nextTime > 1.0 ? 0.0 : nextTime;
      });
    }, 120);

    return () => clearInterval(interval);
  }, [timeFlowPaused]);

  // Handle building inventory incrementing on mined voxels
  const handleIncrementBlock = (type: BlockType, count: number) => {
    if (type === BlockType.AIR) return;
    setInventory(prev => {
      const cur = prev[type] || 0;
      const nextCount = Math.max(0, cur + count);
      return {
        ...prev,
        [type]: nextCount,
      };
    });
  };

  // Perform a complete crafted block transmute
  const handleCraftRecipe = (recipe: CraftingRecipe) => {
    setInventory(prev => {
      const nextInv = { ...prev };
      
      // Deduct inputs
      recipe.input.forEach(item => {
        const cur = nextInv[item.type] || 0;
        nextInv[item.type] = Math.max(0, cur - item.count);
      });

      // Add output
      const outCur = nextInv[recipe.output.type] || 0;
      nextInv[recipe.output.type] = outCur + recipe.output.count;

      return nextInv;
    });
  };

  // Save map structure to local DB
  const handleSaveWorld = () => {
    const success = world.saveToLocalStorage();
    if (success) {
      alert('Voxel world structures successfully saved to browser memory!');
    } else {
      alert('Save failed. Ensure cookies or local storage is enabled.');
    }
  };

  // Load map structure from local DB
  const handleLoadWorld = () => {
    const success = world.loadFromLocalStorage();
    if (success) {
      alert('Custom world designs successfully loaded!');
      window.location.reload(); // Quick refresh triggers Three mesh reconstruction
    } else {
      alert('No save file found! Creating a fresh game world instead.');
    }
  };

  // Reset terrain blank
  const handleClearWorld = () => {
    world.clearWorld();
    localStorage.removeItem('voxel_world_data_v1');
    window.location.reload();
  };

  // Force player back onto spawn safety block
  const handleRespawnPlr = () => {
    canvasBridgeRef.current?.resetPlayerPos();
    audio.playJump();
  };

  // Bridge HUD updates back from 3D animate loop
  const handleUpdateHUD = (data: {
    isGrounded: boolean;
    position: Vector3D;
    breakProgress: number;
    activeBlockTarget: { x: number; y: number; z: number; type: BlockType } | null;
  }) => {
    setIsGrounded(data.isGrounded);
    setPosition(data.position);
    setBreakProgress(data.breakProgress);
    setActiveBlockTarget(data.activeBlockTarget);
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-zinc-950 text-stone-100 overflow-hidden relative select-none" id="applet-root">
      
      {/* BACKGROUND SCENE STAGE VIEW */}
      <div className="flex-1 relative w-full h-full overflow-hidden" id="stage-3d-wrapper">
        <VoxelCanvas
          world={world}
          physics={physics}
          activeItem={activeItem}
          gameMode={gameMode}
          flying={flying}
          onUpdateHUD={handleUpdateHUD}
          inventory={inventory}
          onIncrementBlockCount={handleIncrementBlock}
          virtualInputs={virtualInputs}
          timeOfDay={timeOfDay}
          onRef={(ref) => { canvasBridgeRef.current = ref; }}
          id="three-voxel-canvas"
        />

        {/* COMPREHENSIVE OVERLACING HUD UI */}
        <GameHUD
          position={position}
          isGrounded={isGrounded}
          breakProgress={breakProgress}
          activeBlockTarget={activeBlockTarget}
          activeItem={activeItem}
          onChangeActiveItem={setActiveItem}
          gameMode={gameMode}
          onChangeGameMode={setGameMode}
          flying={flying}
          onToggleFlying={() => setFlying(!flying)}
          inventory={inventory}
          onCraft={handleCraftRecipe}
          onSaveWorld={handleSaveWorld}
          onLoadWorld={handleLoadWorld}
          onClearWorld={handleClearWorld}
          onResetPlayer={handleRespawnPlr}
          timeOfDay={timeOfDay}
          onChangeTimeOfDay={setTimeOfDay}
          virtualInputs={virtualInputs}
          setVirtualInputs={setVirtualInputs}
          id="hud-overlay"
        />
      </div>

    </div>
  );
}
