/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BlockType, BlockDefinition } from './types';

export const BLOCK_DEFINITIONS: Record<BlockType, BlockDefinition> = {
  [BlockType.AIR]: {
    type: BlockType.AIR,
    name: 'Air',
    isSolid: false,
    isTransparent: true,
    color: 'rgba(0, 0, 0, 0)',
    breakTimeMs: 0,
    soundType: 'grass',
  },
  [BlockType.GRASS]: {
    type: BlockType.GRASS,
    name: 'Grass Block',
    isSolid: true,
    color: '#55761a',
    colors: {
      top: '#598b2c',
      bottom: '#866043',
      sides: '#7b5c3d',
    },
    breakTimeMs: 400,
    toolRequired: 'shovel',
    soundType: 'grass',
  },
  [BlockType.DIRT]: {
    type: BlockType.DIRT,
    name: 'Dirt',
    isSolid: true,
    color: '#866043',
    breakTimeMs: 350,
    toolRequired: 'shovel',
    soundType: 'gravel',
  },
  [BlockType.STONE]: {
    type: BlockType.STONE,
    name: 'Stone',
    isSolid: true,
    color: '#737373',
    breakTimeMs: 1000,
    toolRequired: 'pickaxe',
    soundType: 'stone',
  },
  [BlockType.WOOD_LOG]: {
    type: BlockType.WOOD_LOG,
    name: 'Oak Wood Log',
    isSolid: true,
    color: '#a07040',
    colors: {
      top: '#d7bc8d',
      bottom: '#d7bc8d',
      sides: '#5c4033',
    },
    breakTimeMs: 750,
    toolRequired: 'axe',
    soundType: 'wood',
  },
  [BlockType.LEAVES]: {
    type: BlockType.LEAVES,
    name: 'Oak Leaves',
    isSolid: true,
    isTransparent: true,
    color: '#2e5c1e',
    breakTimeMs: 150,
    toolRequired: 'any',
    soundType: 'grass',
  },
  [BlockType.PLANK]: {
    type: BlockType.PLANK,
    name: 'Wooden Planks',
    isSolid: true,
    color: '#c39b6e',
    breakTimeMs: 500,
    toolRequired: 'axe',
    soundType: 'wood',
  },
  [BlockType.GLASS]: {
    type: BlockType.GLASS,
    name: 'Glass Block',
    isSolid: true,
    isTransparent: true,
    color: '#e0f7fa',
    breakTimeMs: 100,
    soundType: 'glass',
  },
  [BlockType.COBBLESTONE]: {
    type: BlockType.COBBLESTONE,
    name: 'Cobblestone',
    isSolid: true,
    color: '#5e5e5e',
    breakTimeMs: 800,
    toolRequired: 'pickaxe',
    soundType: 'stone',
  },
};

export class VoxelWorld {
  public widthX: number = 40;
  public heightY: number = 16;
  public depthZ: number = 40;
  private blocks: Uint8Array;

  constructor(widthX = 40, heightY = 16, depthZ = 40) {
    this.widthX = widthX;
    this.heightY = heightY;
    this.depthZ = depthZ;
    this.blocks = new Uint8Array(this.widthX * this.heightY * this.depthZ);
    this.generateDefaultTerrain();
  }

  private getIndex(x: number, y: number, z: number): number {
    return x + y * this.widthX + z * this.widthX * this.heightY;
  }

  public outOfBounds(x: number, y: number, z: number): boolean {
    return x < 0 || x >= this.widthX || y < 0 || y >= this.heightY || z < 0 || z >= this.depthZ;
  }

  public getBlock(x: number, y: number, z: number): BlockType {
    if (this.outOfBounds(x, y, z)) {
      // Return air if looking below or above, but return stone if below bound for barrier
      if (y < 0) return BlockType.STONE;
      return BlockType.AIR;
    }
    return this.blocks[this.getIndex(x, Math.floor(y), z)];
  }

  public setBlock(x: number, y: number, z: number, blockType: BlockType): void {
    if (this.outOfBounds(x, y, z)) return;
    this.blocks[this.getIndex(x, Math.floor(y), z)] = blockType;
  }

  public isSolid(x: number, y: number, z: number): boolean {
    const block = this.getBlock(x, y, z);
    return BLOCK_DEFINITIONS[block]?.isSolid || false;
  }

  /**
   * Generates default procedural grass plains with a layer of dirt and stones underneath, and scattered trees.
   */
  public generateDefaultTerrain(): void {
    const groundLevel = 5;

    // Fill bedrock / stone / dirt / grass
    for (let x = 0; x < this.widthX; x++) {
      for (let z = 0; z < this.depthZ; z++) {
        // Simple variation (soft rolling hills using sine waves)
        const sineHeight = Math.floor(Math.sin(x * 0.15) * Math.cos(z * 0.15) * 1.5);
        const activeGroundLevel = groundLevel + sineHeight;

        for (let y = 0; y < this.heightY; y++) {
          if (y === 0) {
            this.setBlock(x, y, z, BlockType.STONE); // Bedrock bottom
          } else if (y < activeGroundLevel - 2) {
            this.setBlock(x, y, z, BlockType.STONE); // Underground stone
          } else if (y < activeGroundLevel) {
            this.setBlock(x, y, z, BlockType.DIRT); // Intermediate dirt
          } else if (y === activeGroundLevel) {
            this.setBlock(x, y, z, BlockType.GRASS); // Top grass layer
          } else {
            this.setBlock(x, y, z, BlockType.AIR); // Air above
          }
        }
      }
    }

    // Add random trees
    const treePoints: {x: number; z: number}[] = [
      { x: 8, z: 8 },
      { x: 12, z: 25 },
      { x: 28, z: 12 },
      { x: 32, z: 32 },
      { x: 10, z: 30 },
      { x: 24, z: 18 },
    ];

    treePoints.forEach(pt => {
      this.generateTree(pt.x, pt.z);
    });
  }

  public generateTree(trunkX: number, trunkZ: number): void {
    // Find top surface y
    let terrainY = -1;
    for (let y = this.heightY - 1; y >= 0; y--) {
      if (this.getBlock(trunkX, y, trunkZ) === BlockType.GRASS) {
        terrainY = y;
        break;
      }
    }

    if (terrainY === -1 || terrainY >= this.heightY - 5) return;

    const trunkHeight = 4 + Math.floor(Math.random() * 2);
    const startLeavesY = terrainY + trunkHeight - 1;

    // Build wood trunk
    for (let h = 1; h <= trunkHeight; h++) {
      this.setBlock(trunkX, terrainY + h, trunkZ, BlockType.WOOD_LOG);
    }

    // Build leaves canopy crown
    for (let ly = startLeavesY; ly <= terrainY + trunkHeight + 1; ly++) {
      const isTop = ly === terrainY + trunkHeight + 1;
      const radius = isTop ? 1 : 2;

      for (let lx = trunkX - radius; lx <= trunkX + radius; lx++) {
        for (let lz = trunkZ - radius; lz <= trunkZ + radius; lz++) {
          // Avoid trunks directly, and round the edges a bit
          if (lx === trunkX && lz === trunkZ && ly < terrainY + trunkHeight) {
            continue;
          }
          const isEdgeCorner = Math.abs(lx - trunkX) === radius && Math.abs(lz - trunkZ) === radius;
          if (isEdgeCorner && radius > 1 && Math.random() > 0.4) {
            continue; // irregular round branches
          }
          if (this.getBlock(lx, ly, lz) === BlockType.AIR) {
            this.setBlock(lx, ly, lz, BlockType.LEAVES);
          }
        }
      }
    }
  }

  /**
   * Resets world blocks
   */
  public clearWorld(): void {
    this.blocks.fill(BlockType.AIR);
    this.generateDefaultTerrain();
  }

  /**
   * Save world representation to browser local storage
   */
  public saveToLocalStorage(): boolean {
    try {
      const dataString = btoa(String.fromCharCode.apply(null, Array.from(this.blocks)));
      localStorage.setItem('voxel_world_data_v1', JSON.stringify({
        widthX: this.widthX,
        heightY: this.heightY,
        depthZ: this.depthZ,
        blocks: dataString,
      }));
      return true;
    } catch (e) {
      console.error('Failed to save to local storage', e);
      return false;
    }
  }

  /**
   * Load world representation from browser local storage
   */
  public loadFromLocalStorage(): boolean {
    try {
      const stored = localStorage.getItem('voxel_world_data_v1');
      if (!stored) return false;

      const parsed = JSON.parse(stored);
      this.widthX = parsed.widthX;
      this.heightY = parsed.heightY;
      this.depthZ = parsed.depthZ;

      const binString = atob(parsed.blocks);
      const len = binString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binString.charCodeAt(i);
      }
      this.blocks = bytes;
      return true;
    } catch (e) {
      console.error('Failed to load from local storage', e);
      return false;
    }
  }

  /**
   * EXTENSION HOOK: Day/Night time cycle ticker
   */
  public getAmbientLightIntensity(timeOfDay: number): number {
    // timeOfDay: 0 to 1 duration
    // return factor from 0.1 (midnight) to 1.0 (noon)
    const angle = timeOfDay * Math.PI * 2;
    const value = Math.sin(angle); // -1 to 1
    return 0.2 + 0.8 * Math.max(0, value);
  }
}
