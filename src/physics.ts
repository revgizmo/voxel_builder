/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VoxelWorld } from './world';
import { Vector3D } from './types';

export class VoxelPhysics {
  public gravity: number = 22; // Block units per second^2
  public terminalVelocity: number = 30;

  // Player dimensions
  public playerWidth: number = 0.5; // Roughly half a block thick
  public playerHeight: number = 1.6; // Stand eye-height is ~1.5m

  /**
   * Updates player position with gravity, handles keyboard move velocity, 
   * and runs axis-by-axis collision checks.
   */
  public update(
    pos: Vector3D,
    vel: Vector3D,
    inputs: { forward: number; strafe: number; jump: boolean },
    yaw: number,
    world: VoxelWorld,
    dt: number,
    flying: boolean = false
  ): { nextPos: Vector3D; nextVel: Vector3D; isGrounded: boolean } {
    let nextPos = { ...pos };
    let nextVel = { ...vel };

    const speed = flying ? 12 : 5.0; // Movements blocks/second
    const jumpForce = 8.0;

    // 1. Calculate horizontal move vector relative to camera direction
    let moveX = 0;
    let moveZ = 0;

    if (inputs.forward !== 0 || inputs.strafe !== 0) {
      // Calculate movement relative to yaw orientation
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);

      // Local movement relative to facing direction
      const localX = inputs.strafe;
      const localZ = -inputs.forward;

      // Rotate into world space coordinates
      moveX = localX * cosY - localZ * sinY;
      moveZ = localX * sinY + localZ * cosY;

      // Normalize horizontal direction to avoid diagonal hyper-speed
      const length = Math.sqrt(moveX * moveX + moveZ * moveZ);
      if (length > 0) {
        moveX = (moveX / length) * speed;
        moveZ = (moveZ / length) * speed;
      }
    }

    // Set horizontal velocities directly with simple slide/friction dampening
    nextVel.x = moveX;
    nextVel.z = moveZ;

    // 2. Apply vertical velocity: Gravity or Flying keys
    let isGrounded = false;
    
    if (flying) {
      // In flight mode, jump moves up, floating is active
      if (inputs.jump) {
        nextVel.y = speed;
      } else if (inputs.forward === 0 && inputs.strafe === 0 && Math.abs(nextVel.y) > 0.1) {
        // Slow down drift
        nextVel.y *= 0.8;
      } else {
        nextVel.y = 0;
      }
    } else {
      // Standard heavy block gravity
      nextVel.y -= this.gravity * dt;
      if (nextVel.y < -this.terminalVelocity) {
        nextVel.y = -this.terminalVelocity;
      }
    }

    // 3. Collision Box setup
    // Center of player is at (pos.x, pos.y, pos.z). 
    // Player height starts from pos.y (feet) to pos.y + playerHeight (head)
    const pW = this.playerWidth;
    const pH = this.playerHeight;

    // Reset jump velocity on click if player is grounded
    // We check grounding after resolving Y axis, so we'll evaluate if the bottom collides.

    // Let's resolve collision axis-by-axis! This prevents diagonal clipping exploits.

    // --- AXIS X ---
    nextPos.x += nextVel.x * dt;
    if (this.isCollidingWithWorld(nextPos.x, nextPos.y, nextPos.z, pW, pH, world)) {
      // Revert change, slide against wall
      if (nextVel.x > 0) {
        // Collided while moving right, align to left edge of blocking voxel
        nextPos.x = Math.floor(nextPos.x + pW / 2) - pW / 2 - 0.001;
      } else if (nextVel.x < 0) {
        // Collided while moving left, align to right edge of blocking voxel
        nextPos.x = Math.floor(nextPos.x - pW / 2) + 1 + pW / 2 + 0.001;
      }
      nextVel.x = 0;
    }

    // --- AXIS Y ---
    // Apply gravity velocity
    nextPos.y += nextVel.y * dt;
    if (this.isCollidingWithWorld(nextPos.x, nextPos.y, nextPos.z, pW, pH, world)) {
      if (nextVel.y < 0) {
        // Collided while falling Downwards - Landed on a block!
        nextPos.y = Math.floor(nextPos.y) + 1.0;
        nextVel.y = 0;
        isGrounded = true;
      } else if (nextVel.y > 0) {
        // Collided with ceiling while jumping Upwards
        nextPos.y = Math.floor(nextPos.y + pH) - pH - 0.001;
        nextVel.y = 0;
      }
    } else {
      // Verify if just touching the floor below (for jump allowance indicator)
      isGrounded = this.isCollidingWithWorld(nextPos.x, nextPos.y - 0.01, nextPos.z, pW, pH, world);
    }

    // Grounded trigger jumping upward force
    if (isGrounded && inputs.jump && !flying) {
      nextVel.y = jumpForce;
      isGrounded = false;
    }

    // --- AXIS Z ---
    nextPos.z += nextVel.z * dt;
    if (this.isCollidingWithWorld(nextPos.x, nextPos.y, nextPos.z, pW, pH, world)) {
      // Revert Z change and align
      if (nextVel.z > 0) {
        // Collided moving deep positive, align to boundary
        nextPos.z = Math.floor(nextPos.z + pW / 2) - pW / 2 - 0.001;
      } else if (nextVel.z < 0) {
        nextPos.z = Math.floor(nextPos.z - pW / 2) + 1 + pW / 2 + 0.001;
      }
      nextVel.z = 0;
    }

    // Void fallback protect
    if (nextPos.y < -15) {
      nextPos = { x: world.widthX / 2, y: world.heightY + 2, z: world.depthZ / 2 };
      nextVel = { x: 0, y: 0, z: 0 };
    }

    return { nextPos, nextVel, isGrounded };
  }

  /**
   * Core boundary overlap verification helper.
   * Walks across the player's bounding envelope cuboid in voxel space and checks for solidity.
   */
  private isCollidingWithWorld(
    px: number,
    py: number,
    pz: number,
    pWidth: number,
    pHeight: number,
    world: VoxelWorld
  ): boolean {
    const minX = Math.floor(px - pWidth / 2);
    const maxX = Math.floor(px + pWidth / 2);
    const minY = Math.floor(py);
    const maxY = Math.floor(py + pHeight);
    const minZ = Math.floor(pz - pWidth / 2);
    const maxZ = Math.floor(pz + pWidth / 2);

    // Iterates all overlapping cell grid coordinates
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (world.isSolid(x, y, z)) {
            return true;
          }
        }
      }
    }
    return false;
  }
}
