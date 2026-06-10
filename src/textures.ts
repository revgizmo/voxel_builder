/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as THREE from 'three';

// Cache for generated materials
const textureCache: Record<string, THREE.Texture> = {};

/**
 * Procedurally generates a pixelated noise texture with specific colors and patterns.
 * Returns a high-quality crisp THREE.Texture using NearestFilter (non-blurry pixelated look).
 */
export function getProceduralTexture(
  id: string,
  baseColor: string,
  options: {
    noiseIntensity?: number;
    pattern?: 'blank' | 'speckled' | 'bark' | 'rings' | 'planks' | 'glass' | 'cobble';
    blendColor?: string;
  } = {}
): THREE.Texture {
  const cacheKey = `${id}_${baseColor}_${options.pattern || 'speckled'}`;
  if (textureCache[cacheKey]) {
    return textureCache[cacheKey];
  }

  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;

  // Fill base color
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, 16, 16);

  const noise = options.noiseIntensity ?? 0.15;
  const rgbBase = hexToRgb(baseColor);
  const rgbBlend = options.blendColor ? hexToRgb(options.blendColor) : null;

  if (options.pattern === 'cobble') {
    // Generate cobblestone tiles
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        // Simple tile boundaries
        const isBorder = py % 8 === 0 || px % 8 === 0 || (px+py) % 8 === 0;
        const offset = (Math.random() - 0.5) * noise * 255;
        let r = rgbBase.r + offset;
        let g = rgbBase.g + offset;
        let b = rgbBase.b + offset;

        if (isBorder) {
          r *= 0.6; g *= 0.6; b *= 0.6;
        }

        ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, r))}, ${Math.max(0, Math.min(255, g))}, ${Math.max(0, Math.min(255, b))})`;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  } else if (options.pattern === 'planks') {
    // Generate horizontal wooden planks
    for (let py = 0; py < 16; py++) {
      const isSeam = py === 0 || py === 5 || py === 10 || py === 15;
      for (let px = 0; px < 16; px++) {
        const isVerticalSeam = px % 8 === 0 && ((py < 5) || (py >= 5 && py < 10 && px % 16 === 8) || (py >= 10 && px % 16 === 0));
        const offset = (Math.random() - 0.5) * noise * 255;
        let r = rgbBase.r + (isSeam ? -40 : offset);
        let g = rgbBase.g + (isSeam ? -40 : offset);
        let b = rgbBase.b + (isSeam ? -40 : offset);

        if (isVerticalSeam) {
          r -= 50; g -= 50; b -= 50;
        }

        ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, r))}, ${Math.max(0, Math.min(255, g))}, ${Math.max(0, Math.min(255, b))})`;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  } else if (options.pattern === 'bark') {
    // Wood bark: vertical stripes and deep notches
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        const isStripe = px % 4 === 0 || (px + py * 2) % 6 === 0;
        const offset = (Math.random() - 0.5) * noise * 255;
        let factor = isStripe ? 0.7 : 1.0;
        let r = rgbBase.r * factor + offset;
        let g = rgbBase.g * factor + offset;
        let b = rgbBase.b * factor + offset;

        ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, r))}, ${Math.max(0, Math.min(255, g))}, ${Math.max(0, Math.min(255, b))})`;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  } else if (options.pattern === 'rings') {
    // Top of logs: concentric rings
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        const dx = px - 7.5;
        const dy = py - 7.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const isRing = Math.floor(dist) % 2 === 0;
        const offset = (Math.random() - 0.5) * 50 * noise;
        let factor = isRing ? 0.85 : 1.05;

        let r = rgbBase.r * factor + offset;
        let g = rgbBase.g * factor + offset;
        let b = rgbBase.b * factor + offset;

        ctx.fillStyle = `rgb(${Math.max(0, Math.min(255, r))}, ${Math.max(0, Math.min(255, g))}, ${Math.max(0, Math.min(255, b))})`;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  } else if (options.pattern === 'glass') {
    // Glass: clear background with cyan border highlights
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = 'rgba(230, 250, 255, 0.15)'; // light fill
    ctx.fillRect(1, 1, 14, 14);

    // Cyan borders
    ctx.fillStyle = '#b2ebf2';
    ctx.fillRect(0, 0, 16, 1);
    ctx.fillRect(0, 15, 16, 1);
    ctx.fillRect(0, 0, 1, 16);
    ctx.fillRect(15, 0, 1, 16);

    // Diagonal shimmer highlights
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(3, 3, 2, 1);
    ctx.fillRect(11, 11, 2, 1);
    ctx.fillRect(4, 11, 1, 1);
  } else {
    // Default: speckled noise
    for (let py = 0; py < 16; py++) {
      for (let px = 0; px < 16; px++) {
        let r = rgbBase.r;
        let g = rgbBase.g;
        let b = rgbBase.b;

        // Custom blending for grass top to give rich fibers
        if (rgbBlend && Math.random() > 0.6) {
          r = rgbBlend.r;
          g = rgbBlend.g;
          b = rgbBlend.b;
        }

        const offset = (Math.random() - 0.5) * noise * 255;
        r = Math.max(0, Math.min(255, r + offset));
        g = Math.max(0, Math.min(255, g + offset));
        b = Math.max(0, Math.min(255, b + offset));

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  // Important! Disable blur to make textures beautifully sharp and pixelated (Minecraft look!)
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;

  textureCache[cacheKey] = texture;
  return texture;
}

/**
 * Parses Hex color strings into RGB numeric objects.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const cleanHex = hex.replace('#', '');
  const bigint = parseInt(cleanHex, 16);
  if (cleanHex.length === 6) {
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    };
  } else if (cleanHex.length === 3) {
    // handles simplified CSS #fff
    let r = (bigint >> 8) & 15;
    let g = (bigint >> 4) & 15;
    let b = bigint & 15;
    return {
      r: (r << 4) | r,
      g: (g << 4) | g,
      b: (b << 4) | b,
    };
  }
  return { r: 120, g: 120, b: 120 };
}
