/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum BlockType {
  AIR = 0,
  GRASS = 1,
  DIRT = 2,
  STONE = 3,
  WOOD_LOG = 4,
  LEAVES = 5,
  PLANK = 6,
  GLASS = 7,
  COBBLESTONE = 8,
}

export interface BlockDefinition {
  type: BlockType;
  name: string;
  isSolid: boolean;
  isTransparent?: boolean;
  color: string; // fallback or default mesh color
  colors?: {
    top: string;
    bottom: string;
    sides: string;
  };
  breakTimeMs: number; // Duration in ms to break this block
  toolRequired?: 'shovel' | 'pickaxe' | 'axe' | 'any';
  soundType: 'grass' | 'gravel' | 'stone' | 'wood' | 'glass';
}

export interface InventoryItem {
  type: BlockType;
  count: number;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Particle {
  position: [number, number, number];
  velocity: [number, number, number];
  color: string;
  size: number;
  life: number; // from 1.0 down to 0.0
}

export type EntityType = 'player' | 'zombie' | 'sheep' | 'cow' | 'chicken';

export interface Entity {
  id: string;
  type: EntityType;
  name: string;
  position: Vector3D;
  velocity: Vector3D;
  width: number;
  height: number;
  health: number;
  maxHealth: number;
  isGrounded: boolean;
  aiState?: {
    action: 'idle' | 'wander' | 'chase' | 'flee';
    targetPosition?: Vector3D;
    timer: number;
  };
}

export interface CraftingRecipe {
  id: string;
  input: { type: BlockType; count: number }[];
  output: { type: BlockType; count: number };
}

export interface GameStats {
  blocksMined: number;
  blocksPlaced: number;
  distanceTraveled: number;
  playTimeMs: number;
}
