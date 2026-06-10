/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { BlockType, Vector3D, Entity, CraftingRecipe } from '../types';
import { BLOCK_DEFINITIONS } from '../world';
import { audio } from '../audio';
import {
  Compass,
  Volume2,
  VolumeX,
  HelpCircle,
  Cpu,
  RotateCcw,
  Save,
  FolderOpen,
  Wrench,
  Sun,
  Moon,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Sparkles,
  Zap
} from 'lucide-react';

interface GameHUDProps {
  position: Vector3D;
  isGrounded: boolean;
  breakProgress: number;
  activeBlockTarget: { x: number; y: number; z: number; type: BlockType } | null;
  activeItem: BlockType;
  onChangeActiveItem: (type: BlockType) => void;
  gameMode: 'survival' | 'creative';
  onChangeGameMode: (mode: 'survival' | 'creative') => void;
  flying: boolean;
  onToggleFlying: () => void;
  inventory: Record<BlockType, number>;
  onCraft: (recipe: CraftingRecipe) => void;
  onSaveWorld: () => void;
  onLoadWorld: () => void;
  onClearWorld: () => void;
  onResetPlayer: () => void;
  timeOfDay: number;
  onChangeTimeOfDay: (time: number) => void;
  virtualInputs: {
    forward: number;
    strafe: number;
    jump: boolean;
    breakBlock: boolean;
    placeBlock: boolean;
  };
  setVirtualInputs: React.Dispatch<React.SetStateAction<{
    forward: number;
    strafe: number;
    jump: boolean;
    breakBlock: boolean;
    placeBlock: boolean;
  }>>;
}

export const GameHUD: React.FC<GameHUDProps> = ({
  position,
  isGrounded,
  breakProgress,
  activeBlockTarget,
  activeItem,
  onChangeActiveItem,
  gameMode,
  onChangeGameMode,
  flying,
  onToggleFlying,
  inventory,
  onCraft,
  onSaveWorld,
  onLoadWorld,
  onClearWorld,
  onResetPlayer,
  timeOfDay,
  onChangeTimeOfDay,
  virtualInputs,
  setVirtualInputs,
}) => {
  const [showHelp, setShowHelp] = useState<boolean>(true);
  const [showSandbox, setShowSandbox] = useState<boolean>(false);
  const [activeSandboxTab, setActiveSandboxTab] = useState<'crafting' | 'entities' | 'world'>('crafting');
  const [muted, setMuted] = useState<boolean>(false);
  const [touchActive, setTouchActive] = useState<boolean>(true); // default touch aids on for easy iframe testing

  // Track double tap for Mine hold/auto-mode
  const lastMineTapRef = React.useRef<number>(0);
  const isMineLockedRef = React.useRef<boolean>(false);
  const [isMineLocked, setIsMineLocked] = useState<boolean>(false);

  const handleMineStart = (e?: React.MouseEvent | React.TouchEvent) => {
    if (e && 'preventDefault' in e && e.type === 'touchstart') {
      e.preventDefault();
    }
    const now = Date.now();
    const diff = now - lastMineTapRef.current;
    lastMineTapRef.current = now;

    if (diff < 300) {
      // Double tap! Toggle lock
      isMineLockedRef.current = !isMineLockedRef.current;
      setIsMineLocked(isMineLockedRef.current);
      setVirtualInputs(p => ({ ...p, breakBlock: isMineLockedRef.current }));
      if (isMineLockedRef.current) {
        audio.playPlace('stone'); // positive feedback click for locking the mine state
      }
    } else {
      if (isMineLockedRef.current) {
        // Tap while locked cancels the locked state and holds/mines normally during active tap
        isMineLockedRef.current = false;
        setIsMineLocked(false);
        setVirtualInputs(p => ({ ...p, breakBlock: true }));
      } else {
        setVirtualInputs(p => ({ ...p, breakBlock: true }));
      }
    }
  };

  const handleMineEnd = () => {
    if (!isMineLockedRef.current) {
      setVirtualInputs(p => ({ ...p, breakBlock: false }));
    }
  };

  // State-driven simulation for Future-Proofing Mobs
  const [simulatedEntities, setSimulatedEntities] = useState<Entity[]>([
    {
      id: 'z-01',
      type: 'zombie',
      name: 'Grunting Zombie',
      position: { x: 14.5, y: 6.0, z: 12.2 },
      velocity: { x: 0, y: 0, z: 0 },
      width: 0.6,
      height: 1.8,
      health: 20,
      maxHealth: 20,
      isGrounded: true,
      aiState: { action: 'wander', timer: 2.0 },
    },
    {
      id: 's-01',
      type: 'sheep',
      name: 'Fluffy Sheep',
      position: { x: 26.1, y: 5.0, z: 22.8 },
      velocity: { x: 0, y: 0, z: 0 },
      width: 0.7,
      height: 0.9,
      health: 8,
      maxHealth: 8,
      isGrounded: true,
      aiState: { action: 'idle', timer: 1.5 },
    }
  ]);

  // Crafting Recipes list
  const CRFT_RECIPES: CraftingRecipe[] = [
    {
      id: 'r_planks',
      input: [{ type: BlockType.WOOD_LOG, count: 1 }],
      output: { type: BlockType.PLANK, count: 4 },
    },
    {
      id: 'r_cobble',
      input: [{ type: BlockType.STONE, count: 2 }],
      output: { type: BlockType.COBBLESTONE, count: 2 },
    },
    {
      id: 'r_glass',
      input: [{ type: BlockType.STONE, count: 3 }],
      output: { type: BlockType.GLASS, count: 1 },
    },
  ];

  // Tick the simulated pathfinding zombie AI coordinates
  useEffect(() => {
    const timer = setInterval(() => {
      setSimulatedEntities(prev =>
        prev.map(ent => {
          let nextAction = ent.aiState?.action || 'idle';
          let nt = (ent.aiState?.timer || 0) - 0.2;
          let nx = ent.position.x;
          let nz = ent.position.z;

          if (nt <= 0) {
            nextAction = Math.random() > 0.45 ? 'wander' : 'idle';
            nt = 2.0 + Math.random() * 3.0;
          }

          if (nextAction === 'wander') {
            const angle = (parseFloat(ent.id.charCodeAt(1).toString()) || 5) * 45;
            nx += Math.sin(angle) * 0.15 * (Math.random() - 0.5);
            nz += Math.cos(angle) * 0.15 * (Math.random() - 0.5);

            // Clamp positions to stay inside world limits
            nx = Math.max(1, Math.min(38, nx));
            nz = Math.max(1, Math.min(38, nz));
          }

          return {
            ...ent,
            position: { x: parseFloat(nx.toFixed(2)), y: ent.position.y, z: parseFloat(nz.toFixed(2)) },
            aiState: { action: nextAction, timer: nt },
          };
        })
      );
    }, 200);

    return () => clearInterval(timer);
  }, []);

  const triggerSoundToggle = () => {
    const nextMute = audio.toggleMute();
    setMuted(nextMute);
    audio.playPlace('wood');
  };

  const executeCraft = (recipe: CraftingRecipe) => {
    // Check if player has inputs
    let hasAll = true;
    recipe.input.forEach(item => {
      if ((inventory[item.type] || 0) < item.count) {
        hasAll = false;
      }
    });

    if (hasAll || gameMode === 'creative') {
      onCraft(recipe);
      audio.playCraft();
    } else {
      audio.playHit();
    }
  };

  // Human Readable direction heading
  const getDirectionHeading = (): string => {
    return 'East'; // Static placeholder coordinates direction
  };

  const spawnZombieTest = () => {
    const id = `z-${Math.floor(Math.random() * 900) + 100}`;
    const newZombie: Entity = {
      id,
      type: 'zombie',
      name: 'Spawned Zombie',
      position: { x: Math.floor(position.x) + 2, y: Math.floor(position.y), z: Math.floor(position.z) },
      velocity: { x: 0, y: 0, z: 0 },
      width: 0.6,
      height: 1.8,
      health: 20,
      maxHealth: 20,
      isGrounded: true,
      aiState: { action: 'wander', timer: 3.0 },
    };
    setSimulatedEntities(prev => [...prev, newZombie]);
    audio.playHit();
  };

  const formatSkyTime = (time: number): string => {
    // scale 24 hours
    const totalMinutes = Math.floor(time * 24 * 60);
    const hrs = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const ampm = hrs >= 12 ? 'PM' : 'AM';
    const displayHrs = hrs % 12 === 0 ? 12 : hrs % 12;
    const padMin = mins.toString().padStart(2, '0');
    return `${displayHrs}:${padMin} ${ampm}`;
  };

  // Helper arrays for Hotbar selector mapping
  const hotbarItems = [
    BlockType.GRASS,
    BlockType.DIRT,
    BlockType.STONE,
    BlockType.WOOD_LOG,
    BlockType.LEAVES,
    BlockType.PLANK,
    BlockType.GLASS,
    BlockType.COBBLESTONE,
  ];

  // Hotbar listeners to override from selection
  useEffect(() => {
    const selectSlotHandler = (e: any) => {
      const idx = e.detail;
      if (idx >= 0 && idx < hotbarItems.length) {
        onChangeActiveItem(hotbarItems[idx]);
        audio.playPlace('grass');
      }
    };
    window.addEventListener('hotbar_set_slot', selectSlotHandler);
    return () => window.removeEventListener('hotbar_set_slot', selectSlotHandler);
  }, [onChangeActiveItem]);

  return (
    <div className="absolute inset-0 pointer-events-none select-none flex flex-col justify-between font-sans text-stone-100 z-10" id="game-hud-container">
      
      {/* HEADER BAR: Quick Toggles and Metrics */}
      <div className="w-full flex items-start justify-between p-4 bg-gradient-to-b from-black/60 to-transparent pointer-events-auto" id="hud-top-bar">
        {/* Readings */}
        <div className="flex flex-col gap-1 text-slate-200" id="hud-metrics">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs px-2 py-0.5 bg-black/40 rounded-sm text-emerald-400 font-bold border border-emerald-500/20">
              {gameMode.toUpperCase()} MODE
            </span>
            <span className={`font-mono text-xs px-2 py-0.5 bg-black/40 rounded-sm font-bold border ${flying ? 'text-sky-400 border-sky-500/20 bg-sky-950/20' : 'text-stone-400 border-stone-500/20'}`}>
              FLIGHT: {flying ? 'ACTIVE' : 'OFF'}
            </span>
          </div>
          <div className="font-mono text-xs mt-1 space-y-0.5 text-slate-300">
            <div>POS: <span className="text-stone-100 font-bold">{position.x}</span>, <span className="text-stone-100 font-bold">{position.y}</span>, <span className="text-stone-100 font-bold">{position.z}</span></div>
            <div className="text-slate-400">Grounded: <span className={isGrounded ? 'text-emerald-400' : 'text-amber-400'}>{isGrounded ? 'True' : 'False'}</span></div>
          </div>
        </div>

        {/* Center: Ambient Clock Time representation */}
        <div className="flex items-center gap-2 bg-black/40 backdrop-blur-xs py-1.5 px-3.5 rounded-full border border-stone-500/20" id="hud-clock">
          {timeOfDay > 0.25 && timeOfDay < 0.75 ? (
            <Sun className="w-4 h-4 text-amber-400 animate-spin-slow" />
          ) : (
            <Moon className="w-4 h-4 text-sky-300" />
          )}
          <span className="font-mono text-sm font-bold tracking-tight">{formatSkyTime(timeOfDay)}</span>
        </div>

        {/* Right side Buttons */}
        <div className="flex items-center gap-2" id="hud-utility-toggles">
          <button
            onClick={triggerSoundToggle}
            className="p-1.5 bg-black/50 hover:bg-black/75 rounded-md border border-stone-700 pointer-events-auto cursor-pointer transition-all duration-150"
            title="Toggle Audio"
            id="toggle-audio-btn"
          >
            {muted ? <VolumeX className="w-4 h-4 text-amber-500" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          <button
            onClick={() => { setTouchActive(!touchActive); audio.playPlace('grass'); }}
            className={`px-3 py-1 bg-black/50 text-xs font-mono font-bold border rounded-md pointer-events-auto cursor-pointer transition-all duration-150 ${touchActive ? 'border-emerald-500/50 text-emerald-400 bg-emerald-900/20' : 'border-stone-700 text-stone-400 hover:text-stone-300'}`}
            id="toggle-touch-controls-btn"
          >
            TOUCH CONTROLS
          </button>

          <button
            onClick={() => { setShowHelp(!showHelp); audio.playPlace('grass'); }}
            className={`p-1.5 bg-black/50 hover:bg-black/75 rounded-md border pointer-events-auto cursor-pointer transition-all duration-150 ${showHelp ? 'border-emerald-500/40 text-emerald-400' : 'border-stone-700'}`}
            title="Instructions Helper"
            id="toggle-help-btn"
          >
            <HelpCircle className="w-4 h-4" />
          </button>

          <button
            onClick={() => { setShowSandbox(!showSandbox); audio.playPlace('wood'); }}
            className={`flex items-center gap-2 px-3 py-1 bg-indigo-950/70 hover:bg-indigo-900/80 rounded-md border pointer-events-auto cursor-pointer text-xs font-bold font-mono transition-all duration-150 ${showSandbox ? 'border-indigo-400 text-indigo-200' : 'border-indigo-700/60 text-indigo-300'}`}
            id="toggle-architect-panel-btn"
          >
            <Cpu className="w-3.5 h-3.5" />
            DEVELOPER PANEL
          </button>
        </div>
      </div>

      {/* CROSSHAIR RETICLE (Absolute Center) */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center flex-col pointer-events-none" id="hud-crosshair-spot">
        {/* Precise Cross lines */}
        <div className="w-3.5 h-3.5 relative">
          <div className="absolute left-1.5 right-1.5 top-0 bottom-0 bg-stone-100 shadow-[0_0_2px_rgba(0,0,0,0.85)] rounded-xs"></div>
          <div className="absolute left-0 right-0 top-1.5 bottom-1.5 bg-stone-100 shadow-[0_0_2px_rgba(0,0,0,0.85)] rounded-xs"></div>
        </div>

        {/* Small Tooltip showing target block info */}
        {activeBlockTarget && (
          <div className="mt-2.5 flex flex-col items-center" id="hud-voxel-tooltip">
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-zinc-950/80 backdrop-blur-xs rounded-md border border-stone-700/50 shadow-md">
              <span 
                className="w-2.5 h-2.5 rounded-xs border border-white/10" 
                style={{ backgroundColor: BLOCK_DEFINITIONS[activeBlockTarget.type]?.color || '#888' }}
              />
              <span className="text-[11px] font-mono font-bold tracking-tight text-white">
                {BLOCK_DEFINITIONS[activeBlockTarget.type]?.name || 'Unknown Block'}
              </span>
              <span className="text-[9px] font-mono text-stone-400 bg-white/5 py-0.25 px-1 rounded-sm">
                ({activeBlockTarget.x}, {activeBlockTarget.y}, {activeBlockTarget.z})
              </span>
            </div>
          </div>
        )}

        {/* Dynamic Break feedback slider */}
        {breakProgress > 0 && (
          <div className="mt-3 flex flex-col items-center gap-1" id="mining-progress-wrapper">
            <div className="w-16 h-1 bg-zinc-950/75 border border-stone-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 transition-all duration-75"
                style={{ width: `${breakProgress * 100}%` }}
              ></div>
            </div>
            <span className="text-[10px] font-mono text-amber-400 bg-zinc-950/80 py-0.5 px-1.5 rounded-sm border border-amber-400/20">
              MINING {Math.floor(breakProgress * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* INSTRUCTIONS FLOATING MANUAL CARD (Top Left overlay) */}
      {showHelp && (
        <div className="absolute top-18 left-4 max-sm:left-[4%] max-sm:right-[4%] max-sm:top-16 max-sm:max-w-[92%] max-w-sm p-4 bg-zinc-950/92 backdrop-blur-md rounded-lg border border-stone-800 pointer-events-auto flex flex-col shadow-2xl transition-all z-40" id="help-dialog-card">
          <div className="flex justify-between items-center mb-2 pb-1.5 border-b border-stone-800">
            <h4 className="font-bold text-sm text-amber-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> Game Controls Guide
            </h4>
            <button
              onClick={() => setShowHelp(false)}
              className="text-[10px] text-stone-500 hover:text-stone-300 font-mono cursor-pointer"
            >
              (Hide)
            </button>
          </div>
          <div className="text-xs space-y-2 text-stone-300 font-sans leading-relaxed">
            <div>
              <p className="font-semibold text-stone-100">💻 Desktop Controls:</p>
              <ul className="list-disc list-inside mt-0.5 space-y-0.5 font-mono text-[11px] text-slate-400">
                <li><kbd className="bg-stone-800 px-1 py-0.5 text-stone-100 rounded-sm">Mouse Drag/Move</kbd> : Look Around</li>
                <li><kbd className="bg-stone-800 px-1 py-0.5 text-stone-100 rounded-sm">W,A,S,D</kbd> : Walk Movement</li>
                <li><kbd className="bg-stone-800 px-1 py-0.5 text-stone-100 rounded-sm">Space</kbd> : Jump / Float Up</li>
                <li><kbd className="bg-stone-800 px-1 py-0.5 text-stone-100 rounded-sm">Left Click</kbd> : Dig & Break block</li>
                <li><kbd className="bg-stone-800 px-1 py-0.5 text-stone-100 rounded-sm">Q Key</kbd> : (Alternative) Hold Dig</li>
                <li><kbd className="bg-stone-800 px-1 py-0.5 text-stone-100 rounded-sm">E Key</kbd> : Place block in view</li>
                <li><kbd className="bg-stone-800 px-1 py-0.5 text-stone-100 rounded-sm">Scroll / 1-8</kbd> : Select block</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold text-stone-100">📱 Touch & IFrame Controls:</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                The virtual actions panel below allows playing inside the Iframe mockup instantly. Drag directly across the screen to look around!
              </p>
            </div>
            <div className="pt-2 border-t border-stone-800 flex justify-between items-center">
              <span className="text-[10px] text-indigo-400 font-mono font-bold">🛠️ Built in React + Three.js</span>
              <button
                onClick={onResetPlayer}
                className="px-2 py-0.5 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded text-[10px] font-mono cursor-pointer transition-colors"
                id="reset-respawn-btn"
              >
                RESPAWN SAFETY
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DEVELOPER ROADMAP & ARCHITECTURE SANDBOX (Right-Drawer Side panel) */}
      {showSandbox && (
        <div className="absolute right-4 top-18 bottom-28 max-sm:right-[4%] max-sm:left-[4%] max-sm:top-16 max-sm:bottom-20 max-sm:w-[92%] w-96 p-4 bg-slate-950/95 backdrop-blur-xl rounded-xl border border-indigo-700/40 pointer-events-auto shadow-2xl flex flex-col justify-between overflow-hidden z-40" id="dev-sandbox-card">
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-mono text-xs font-bold text-indigo-400 tracking-wider">VM ARCHITECT v1.0</span>
              </div>
              <button
                onClick={() => setShowSandbox(false)}
                className="text-slate-400 hover:text-slate-100 font-mono text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Sandbox Title */}
            <div className="my-2">
              <h3 className="font-bold text-sm text-slate-100">Developer Extension Blueprint</h3>
              <p className="text-[11px] text-slate-400">
                Interactive controllers demonstrating full extendability of the MVP architecture.
              </p>
            </div>

            {/* Sandbox Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800 text-center text-xs font-mono">
              <button
                onClick={() => { setActiveSandboxTab('crafting'); audio.playPlace('wood'); }}
                className={`py-1.5 rounded-md cursor-pointer transition-colors ${activeSandboxTab === 'crafting' ? 'bg-indigo-600 font-bold text-stone-100' : 'text-slate-400 hover:text-slate-200'}`}
                id="sandbox-crafting-tab"
              >
                CRAFTING
              </button>
              <button
                onClick={() => { setActiveSandboxTab('entities'); audio.playPlace('wood'); }}
                className={`py-1.5 rounded-md cursor-pointer transition-colors ${activeSandboxTab === 'entities' ? 'bg-indigo-600 font-bold text-stone-100' : 'text-slate-400 hover:text-slate-200'}`}
                id="sandbox-entities-tab"
              >
                MOBS AI
              </button>
              <button
                onClick={() => { setActiveSandboxTab('world'); audio.playPlace('wood'); }}
                className={`py-1.5 rounded-md cursor-pointer transition-colors ${activeSandboxTab === 'world' ? 'bg-indigo-600 font-bold text-stone-100' : 'text-slate-400 hover:text-slate-200'}`}
                id="sandbox-systems-tab"
              >
                WORLD FX
              </button>
            </div>

            {/* Tab content area */}
            <div className="flex-1 overflow-y-auto mt-3 pr-1 text-xs space-y-3" id="sandbox-active-view">
              
              {/* TAB 1: Real-time Crafting matrix */}
              {activeSandboxTab === 'crafting' && (
                <div className="space-y-2" id="sandbox-crafting-view">
                  <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Wrench className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="font-bold text-slate-200">Interactive Fabricator</span>
                    </div>
                    <p className="text-[11.5px] text-slate-400 leading-normal mb-3">
                      Process gathered raw blocks from your inventory into structured crafting components dynamically below.
                    </p>

                    {/* Recipe cards */}
                    <div className="space-y-2">
                      {CRFT_RECIPES.map(recipe => {
                        const canCraft = recipe.input.every(inp => (inventory[inp.type] || 0) >= inp.count) || gameMode === 'creative';
                        const outDef = BLOCK_DEFINITIONS[recipe.output.type];

                        return (
                          <div
                            key={recipe.id}
                            className={`flex items-center justify-between p-2 rounded-md border text-[11px] transition-colors ${canCraft ? 'border-indigo-500/30 bg-indigo-950/20' : 'border-slate-800 bg-slate-900/30'}`}
                          >
                            <div className="flex flex-col">
                              {/* Inputs */}
                              <div className="flex items-center gap-1.5">
                                {recipe.input.map((inp, idx) => {
                                  const def = BLOCK_DEFINITIONS[inp.type];
                                  return (
                                    <span key={idx} className="font-mono text-[10px] text-zinc-300">
                                      {inp.count}x {def.name} <span className="text-zinc-500">({inventory[inp.type] || 0})</span>
                                    </span>
                                  );
                                })}
                              </div>
                              <div className="text-[12px] font-bold text-slate-200 mt-1 flex items-center gap-1">
                                <span>↳ Output:</span>
                                <span className="text-emerald-400 font-mono">{recipe.output.count}x {outDef?.name}</span>
                              </div>
                            </div>

                            <button
                              onClick={() => executeCraft(recipe)}
                              disabled={!canCraft}
                              className={`px-2.5 py-1 rounded font-bold font-mono text-[10px] cursor-pointer transition-all ${canCraft ? 'bg-emerald-600 hover:bg-emerald-500 text-stone-100 active:scale-95' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
                              id={`craft-recipe-${recipe.id}-btn`}
                            >
                              CRAFT
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-900/30 rounded-lg border border-slate-900 space-y-1.5">
                    <span className="font-bold text-indigo-300 text-[11px] uppercase tracking-wider block">Extension Architecture Note</span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      All crafting recipes are declared as functional declarative arrays of outputs. To integrate tools in the future, simply extend `CraftingRecipe` with specialized criteria, utilizing our existing block decrement registers.
                    </p>
                  </div>
                </div>
              )}

              {/* TAB 2: Future-proofing Zombie & sheep Simulation logs */}
              {activeSandboxTab === 'entities' && (
                <div className="space-y-3" id="sandbox-entities-view">
                  <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-slate-200 flex items-center gap-1.5">
                        <Cpu className="w-3.5 h-3.5 text-indigo-400" /> Simulated Entites AI Ticks
                      </span>
                      <button
                        onClick={spawnZombieTest}
                        className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-[10px] text-stone-100 font-bold rounded cursor-pointer transition-all"
                        id="spawn-test-mob-btn"
                      >
                        + SPAWN TEST ZOMBIE
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-normal">
                      Simulating parallel AI behavior scripts walking, turning, and updating collision bounding boundaries. Registered Entities:
                    </p>

                    {/* Entities coordinate feed */}
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {simulatedEntities.map(ent => (
                        <div key={ent.id} className="p-2 bg-slate-950/40 rounded border border-slate-800 font-mono text-[10.5px] flex items-center justify-between">
                          <div className="flex flex-col">
                            <span className={`font-bold ${ent.type === 'zombie' ? 'text-rose-400' : 'text-sky-300'}`}>
                              {ent.name} <span className="text-stone-500 text-[9px]">[{ent.id}]</span>
                            </span>
                            <span className="text-slate-400 text-[10px] mt-0.5">
                              X:{ent.position.x} Y:{ent.position.y} Z:{ent.position.z}
                            </span>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded text-[9.5px] uppercase font-bold ${ent.aiState?.action === 'wander' ? 'bg-sky-900/30 text-sky-300' : 'bg-slate-800 text-slate-400'}`}>
                            {ent.aiState?.action}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-900/40 rounded-lg border border-slate-800 space-y-1.5">
                    <span className="font-bold text-indigo-300 text-[11px] uppercase tracking-wider block">Unifying Entity Architecture</span>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      To promote mobs in full ThreeJS canvas space:
                    </p>
                    <ul className="list-disc list-inside space-y-1 font-mono text-[10px] text-slate-400 mt-1 pl-1">
                      <li>Model meshes with <code className="text-[10.5px] text-slate-100">THREE.BoxGeometry</code> bodies.</li>
                      <li>Incorporate them in the same <code className="text-[10.5px] text-slate-100">VoxelPhysics.update()</code> coordinate bounds check.</li>
                      <li>Add dynamic pathfinding that points AI targets directly toward player coordinates.</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* TAB 3: World and Local storage managers */}
              {activeSandboxTab === 'world' && (
                <div className="space-y-2" id="sandbox-world-view">
                  <div className="p-2.5 bg-slate-900/60 rounded-lg border border-slate-800 space-y-3">
                    <span className="font-bold text-slate-200 block">World Cycle Controls</span>
                    
                    {/* Time slider */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[10.5px] font-mono text-slate-400">
                        <span>Day/Night Progression</span>
                        <span className="text-indigo-300 font-bold">{formatSkyTime(timeOfDay)}</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.01"
                        value={timeOfDay}
                        onChange={(e) => onChangeTimeOfDay(parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-800 cursor-pointer pointer-events-auto accent-indigo-500 rounded-lg appearance-none"
                        id="time-of-day-slider"
                      />
                    </div>

                    {/* Quick presets */}
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => { onChangeTimeOfDay(0.25); audio.playPlace('grass'); }}
                        className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 font-mono text-[9px] font-bold rounded cursor-pointer transition-colors"
                        id="preset-noon-btn"
                      >
                        MID-DAY
                      </button>
                      <button
                        onClick={() => { onChangeTimeOfDay(0.48); audio.playPlace('grass'); }}
                        className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 font-mono text-[9px] font-bold rounded cursor-pointer transition-colors"
                        id="preset-sunset-btn"
                      >
                        SUNSET
                      </button>
                      <button
                        onClick={() => { onChangeTimeOfDay(0.75); audio.playPlace('grass'); }}
                        className="flex-1 py-1 bg-slate-800 hover:bg-slate-700 font-mono text-[9px] font-bold rounded cursor-pointer transition-colors"
                        id="preset-night-btn"
                      >
                        MIDNIGHT
                      </button>
                    </div>
                  </div>

                  {/* World save clear loads */}
                  <div className="grid grid-cols-3 gap-1.5 p-2.5 bg-slate-900/60 rounded-lg border border-slate-800">
                    <button
                      onClick={() => { onSaveWorld(); audio.playPlace('wood'); }}
                      className="py-2 bg-indigo-900/60 hover:bg-indigo-800 text-[10px] font-mono font-bold rounded border border-indigo-600/40 cursor-pointer transition-colors flex flex-col items-center gap-1 justify-center active:scale-95"
                      id="save-build-db-btn"
                    >
                      <Save className="w-3.5 h-3.5 text-indigo-300" />
                      SAVE DIR
                    </button>
                    <button
                      onClick={() => { onLoadWorld(); audio.playPlace('wood'); }}
                      className="py-2 bg-emerald-950 hover:bg-emerald-900 text-[10px] font-mono font-bold rounded border border-emerald-700/40 cursor-pointer transition-colors flex flex-col items-center gap-1 justify-center active:scale-95"
                      id="load-build-db-btn"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-emerald-300" />
                      LOAD BUILD
                    </button>
                    <button
                      onClick={() => { if (confirm('Clear custom structures and reset terrain?')) { onClearWorld(); audio.playHit(); } }}
                      className="py-2 bg-rose-950/60 hover:bg-rose-900/60 text-[10px] font-mono font-bold rounded border border-rose-850 cursor-pointer transition-colors flex flex-col items-center gap-1 justify-center active:scale-95"
                      id="reset-build-db-btn"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-rose-300" />
                      CLEAR MAP
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>

          {/* Footer stats readings */}
          <div className="mt-4 pt-2 border-t border-slate-800 flex justify-between items-center text-[10px] font-mono text-slate-500">
            <span>ENGINE: Active (Cull Mesh)</span>
            <span>SHARP NearestFilter 16x16</span>
          </div>
        </div>
      )}

      {/* FOOTER BAR: Virtual Joystick Move pad, Break/Place actions, and Hotbar */}
      <div className="w-full p-4 bg-gradient-to-t from-black/80 to-transparent flex flex-col items-center gap-3 select-none" id="hud-bottom-bar">
        
        {/* Virtual on-screen controllers (Only shown or toggled active) */}
        {touchActive && (
          <div className="w-full flex justify-between items-end max-w-4xl px-2 mb-1 pointer-events-none gap-4" id="hud-virtual-controls">
            
            {/* Left side Joystick Pad (Move triggers) */}
            <div className="flex flex-col gap-1 items-center pointer-events-auto" id="virtual-dpad">
              <span className="text-[9px] font-mono font-bold text-stone-500 tracking-wider">DIRECTION PAD</span>
              <div className="grid grid-cols-3 gap-1 bg-zinc-950/80 p-1.5 rounded-xl border border-stone-800 shadow-xl">
                <div></div>
                <button
                  onMouseDown={() => setVirtualInputs(p => ({ ...p, forward: 1 }))}
                  onMouseUp={() => setVirtualInputs(p => ({ ...p, forward: 0 }))}
                  onTouchStart={(e) => { e.preventDefault(); setVirtualInputs(p => ({ ...p, forward: 1 })); }}
                  onTouchEnd={() => setVirtualInputs(p => ({ ...p, forward: 0 }))}
                  onTouchCancel={() => setVirtualInputs(p => ({ ...p, forward: 0 }))}
                  className="w-12 h-12 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 active:bg-indigo-600/85 active:border-indigo-400 rounded-lg flex items-center justify-center text-slate-100 cursor-pointer shadow-md transition-all duration-100"
                  id="v-btn-forward"
                >
                  <ChevronUp className="w-6 h-6 text-slate-300" />
                </button>
                <div></div>

                <button
                  onMouseDown={() => setVirtualInputs(p => ({ ...p, strafe: -1 }))}
                  onMouseUp={() => setVirtualInputs(p => ({ ...p, strafe: 0 }))}
                  onTouchStart={(e) => { e.preventDefault(); setVirtualInputs(p => ({ ...p, strafe: -1 })); }}
                  onTouchEnd={() => setVirtualInputs(p => ({ ...p, strafe: 0 }))}
                  onTouchCancel={() => setVirtualInputs(p => ({ ...p, strafe: 0 }))}
                  className="w-12 h-12 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 active:bg-indigo-600/85 active:border-indigo-400 rounded-lg flex items-center justify-center text-slate-100 cursor-pointer shadow-md transition-all duration-100"
                  id="v-btn-left"
                >
                  <ChevronLeft className="w-6 h-6 text-slate-300" />
                </button>
                <div className="w-12 h-12 bg-zinc-950/40 rounded-lg border border-stone-900/50 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 bg-indigo-500/40 rounded-full animate-pulse"></div>
                </div>
                <button
                  onMouseDown={() => setVirtualInputs(p => ({ ...p, strafe: 1 }))}
                  onMouseUp={() => setVirtualInputs(p => ({ ...p, strafe: 0 }))}
                  onTouchStart={(e) => { e.preventDefault(); setVirtualInputs(p => ({ ...p, strafe: 1 })); }}
                  onTouchEnd={() => setVirtualInputs(p => ({ ...p, strafe: 0 }))}
                  onTouchCancel={() => setVirtualInputs(p => ({ ...p, strafe: 0 }))}
                  className="w-12 h-12 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 active:bg-indigo-600/85 active:border-indigo-400 rounded-lg flex items-center justify-center text-slate-100 cursor-pointer shadow-md transition-all duration-100"
                  id="v-btn-right"
                >
                  <ChevronRight className="w-6 h-6 text-slate-300" />
                </button>

                <div></div>
                <button
                  onMouseDown={() => setVirtualInputs(p => ({ ...p, forward: -1 }))}
                  onMouseUp={() => setVirtualInputs(p => ({ ...p, forward: 0 }))}
                  onTouchStart={(e) => { e.preventDefault(); setVirtualInputs(p => ({ ...p, forward: -1 })); }}
                  onTouchEnd={() => setVirtualInputs(p => ({ ...p, forward: 0 }))}
                  onTouchCancel={() => setVirtualInputs(p => ({ ...p, forward: 0 }))}
                  className="w-12 h-12 bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 active:bg-indigo-600/85 active:border-indigo-400 rounded-lg flex items-center justify-center text-slate-100 cursor-pointer shadow-md transition-all duration-100"
                  id="v-btn-back"
                >
                  <ChevronDown className="w-6 h-6 text-slate-300" />
                </button>
                <div></div>
              </div>
            </div>

            {/* Quick Creative/Survival mode togglers (Floats cleanly to upper right on mobile viewports to prevent screen clutter) */}
            <div className="flex flex-col sm:flex-col gap-1.5 pointer-events-auto max-sm:absolute max-sm:top-24 max-sm:right-4 max-sm:bg-zinc-950/90 max-sm:p-1.5 max-sm:rounded-xl max-sm:border max-sm:border-stone-800 max-sm:shadow-2xl z-20" id="virtual-mode-toggle">
              <button
                onClick={() => {
                  onChangeGameMode(gameMode === 'survival' ? 'creative' : 'survival');
                  audio.playPlace('grass');
                }}
                className="px-2.5 py-1.5 bg-zinc-900 border border-stone-800 hover:border-indigo-500 text-stone-300 text-[10px] font-mono font-bold rounded-lg transition-all cursor-pointer hover:bg-stone-800 active:scale-95"
                id="virtual-game-mode-toggle-btn"
              >
                SWAP MODE ({gameMode === 'survival' ? 'SURV' : 'CREAT'})
              </button>
              <button
                onClick={() => { onToggleFlying(); audio.playJump(); }}
                className={`px-2.5 py-1.5 border text-[10px] font-mono font-bold rounded-lg transition-all cursor-pointer ${flying ? 'border-sky-500 bg-sky-950/65 text-sky-300' : 'border-stone-800 text-stone-400 bg-zinc-900 hover:bg-stone-800'} active:scale-95`}
                id="virtual-flight-toggle-btn"
              >
                TOGGLE FLY
              </button>
            </div>

            {/* Right side block action triggers (Jump, Mine, Place) */}
            <div className="flex flex-col gap-1 items-center pointer-events-auto" id="virtual-action-pad">
              <span className="text-[9px] font-mono font-bold text-stone-500 tracking-wider">ACTIONS PAD</span>
              <div className="flex gap-2.5">
                {/* DIG/MINE (Break trigger with double tap lock support) */}
                <button
                  onMouseDown={(e) => handleMineStart(e)}
                  onMouseUp={handleMineEnd}
                  onTouchStart={(e) => handleMineStart(e)}
                  onTouchEnd={handleMineEnd}
                  onTouchCancel={handleMineEnd}
                  className={`w-14 h-14 rounded-full flex flex-col items-center justify-center cursor-pointer shadow-lg transition-all scale-100 duration-100 ${
                    isMineLocked 
                      ? 'bg-rose-700 border-rose-400 text-white shadow-[0_0_15px_rgba(244,63,94,0.7)] animate-pulse' 
                      : 'bg-rose-950/85 border border-rose-600/40 hover:bg-rose-900 hover:border-rose-500 active:bg-rose-500 active:border-rose-300 text-rose-200'
                  }`}
                  id="v-btn-dig"
                  title="Mine block (Double tap to auto-mine)"
                >
                  <span className="text-[11px] font-bold font-mono tracking-tight">MINE</span>
                  <span className={`text-[8px] font-sans font-extrabold tracking-wider ${isMineLocked ? 'text-amber-300' : 'text-rose-400 opacity-90'}`}>
                    {isMineLocked ? 'AUTO' : 'HOLD'}
                  </span>
                </button>

                {/* PLACE trigger */}
                <button
                  onMouseDown={() => {
                    setVirtualInputs(p => ({ ...p, placeBlock: true }));
                    setTimeout(() => setVirtualInputs(p => ({ ...p, placeBlock: false })), 50);
                  }}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    setVirtualInputs(p => ({ ...p, placeBlock: true }));
                    setTimeout(() => setVirtualInputs(p => ({ ...p, placeBlock: false })), 50);
                  }}
                  className="w-14 h-14 bg-emerald-950/85 border border-emerald-600/40 hover:bg-emerald-900 active:bg-emerald-500 active:border-emerald-300 text-emerald-200 rounded-full flex flex-col items-center justify-center cursor-pointer shadow-lg transition-all scale-100 active:scale-95 duration-100"
                  id="v-btn-place"
                  title="Place selected block"
                >
                  <span className="text-[11px] font-bold font-mono tracking-tight">PLACE</span>
                  <span className="text-[8px] font-sans font-medium text-emerald-400 opacity-90">TAP</span>
                </button>

                {/* JUMP / FLY UP trigger */}
                <button
                  onMouseDown={() => setVirtualInputs(p => ({ ...p, jump: true }))}
                  onMouseUp={() => setVirtualInputs(p => ({ ...p, jump: false }))}
                  onTouchStart={(e) => { e.preventDefault(); setVirtualInputs(p => ({ ...p, jump: true })); }}
                  onTouchEnd={() => setVirtualInputs(p => ({ ...p, jump: false }))}
                  onTouchCancel={() => setVirtualInputs(p => ({ ...p, jump: false }))}
                  className="w-14 h-14 bg-indigo-950/85 border border-indigo-600/40 hover:bg-indigo-900 active:bg-indigo-500 active:border-indigo-300 text-indigo-200 rounded-full flex flex-col items-center justify-center cursor-pointer shadow-lg transition-all scale-100 active:scale-95 duration-100"
                  id="v-btn-jump"
                  title="Jump / Fly Up"
                >
                  <ChevronUp className="w-5 h-5 text-indigo-300 -mb-1 animate-bounce" />
                  <span className="text-[10px] font-bold font-mono tracking-tight">JUMP</span>
                </button>
              </div>
            </div>

          </div>
        )}

        {/* Traditional Hotbar selection layout (Slots 1 to 8 displaying custom generated Blocks) */}
        <div className="flex flex-col items-center gap-1 pointer-events-auto w-full max-w-full px-2" id="hud-hotbar-anchor">
          <div className="flex items-center justify-center gap-1 sm:gap-1.5 p-1.5 sm:p-2 bg-zinc-950/85 rounded-xl border border-stone-800/80 shadow-[0_10px_35px_rgba(0,0,0,0.85)] overflow-x-auto max-w-full">
            {hotbarItems.map((type, index) => {
              const def = BLOCK_DEFINITIONS[type];
              const count = inventory[type] || 0;
              const isSelected = activeItem === type;

              return (
                <button
                  key={type}
                  onClick={() => {
                    onChangeActiveItem(type);
                    audio.playPlace('grass');
                  }}
                  className={`w-9 h-11 sm:w-12 sm:h-12 rounded-lg relative flex flex-col items-center justify-center border transition-all cursor-pointer hover:bg-stone-800/40 flex-shrink-0 ${isSelected ? 'border-amber-400 bg-amber-500/10 shadow-[0_0_10px_rgba(245,158,11,0.25)] scale-102' : 'border-stone-700/60 bg-stone-900/30'}`}
                  title={`${def?.name} (${gameMode === 'creative' ? 'Infinite' : count})`}
                  id={`hotbar-item-${type}`}
                >
                  {/* Decorative Flat visual cube rendering */}
                  <div
                    className="w-4 h-4 sm:w-6 sm:h-6 rounded-xs shadow-inner"
                    style={{ backgroundColor: def?.color }}
                  ></div>

                  {/* Voxel Label */}
                  <span className="text-[7.5px] sm:text-[8px] font-mono text-slate-400 mt-0.5 sm:mt-1 truncate max-w-full scale-90 px-0.5 max-sm:hidden">
                    {def?.name.split(' ')[0]}
                  </span>

                  {/* Quantity Counter label */}
                  <span className="absolute bottom-0.5 right-0.5 sm:bottom-1 sm:right-1 px-1 bg-black/60 rounded text-[8.5px] sm:text-[9px] font-mono font-extrabold text-amber-300">
                    {gameMode === 'creative' ? '∞' : count}
                  </span>

                  {/* Hotbar Slot Key indicator number helper */}
                  <span className="absolute top-0.5 left-0.5 sm:left-1 text-[7.5px] sm:text-[8px] font-mono text-stone-500">
                    {index + 1}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
};
