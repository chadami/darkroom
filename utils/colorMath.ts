import { ColorCorrection } from '../types';

/**
 * Normalizes a filter pack to a 2-filter system where Cyan is locked to 0.
 * In RA-4 printing, adding Cyan is equivalent to subtracting Yellow and Magenta 
 * (relative to the neutral axis).
 */
export const normalizeToYM = (c: number, m: number, y: number): ColorCorrection => {
  // We want the final C to be 0.
  // We shift the entire filter pack by subtracting the C value from all channels.
  return {
    c: 0,
    m: Math.round((m - c) * 10) / 10,
    y: Math.round((y - c) * 10) / 10
  };
};

/**
 * Combines a Base Pack with an Adjustment Pack and normalizes the result.
 */
export const addFiltration = (base: ColorCorrection, adj: ColorCorrection): ColorCorrection => {
  const rawC = (base.c || 0) + (adj.c || 0);
  const rawM = (base.m || 0) + (adj.m || 0);
  const rawY = (base.y || 0) + (adj.y || 0);
  return normalizeToYM(rawC, rawM, rawY);
};

/**
 * Calculates the Filter Adjustment (YMC) based on the wheel position.
 * Uses Standard RGB Wheel Angles: Red=0, Yellow=60, Green=120, Cyan=180, Blue=240, Magenta=300.
 */
export const calculateFiltration = (angleRad: number, distance: number): ColorCorrection => {
  const MAX_FILTRATION = 50; 
  const strength = Math.min(distance, 1) * MAX_FILTRATION;

  // Standard Wheel Axes
  const yAxisAngle = 60 * (Math.PI / 180);
  const mAxisAngle = 300 * (Math.PI / 180);
  const cAxisAngle = 180 * (Math.PI / 180);

  // Project the wheel vector onto the Y, M, and C axes
  // We allow negative values (subtracting filtration)
  const yVal = Math.cos(angleRad - yAxisAngle) * strength;
  const mVal = Math.cos(angleRad - mAxisAngle) * strength;
  const cVal = Math.cos(angleRad - cAxisAngle) * strength;

  // We return the raw projected values. 
  // Normalization to YM-only happens later in the UI pipeline via normalizeToYM if needed,
  // or explicitly here. Let's normalize here to keep the C=0 convention for the numeric readout.
  return normalizeToYM(cVal, mVal, yVal);
};

/**
 * Generates an SVG feColorMatrix string simulating RA-4 Filter effects.
 * 
 * PHYSICS:
 * - Yellow Filter (Y+) blocks Blue light -> Print becomes BLUER.
 * - Magenta Filter (M+) blocks Green light -> Print becomes GREENER.
 * - Cyan Filter (C+) blocks Red light -> Print becomes REDDER.
 * 
 * FORMULA:
 * - Blue Gain increases with Y input.
 * - Green Gain increases with M input.
 * - Red Gain stays baseline (or increases with C input, but Red is usually our anchor).
 */
export const getSVGFilterMatrix = (angleRad: number, distance: number): string => {
  const strength = Math.min(distance, 1);
  const SENSITIVITY = 4.0; // Factor to map 0-1 distance to gain multiplier

  // 1. Map Wheel Position to Y and M inputs
  // Yellow Axis at 60 deg
  const yInput = Math.cos(angleRad - (60 * Math.PI / 180)) * strength;
  
  // Magenta Axis at 300 deg
  const mInput = Math.cos(angleRad - (300 * Math.PI / 180)) * strength;

  // 2. Calculate Channel Gains
  // If Y input is positive (adding Yellow filter), Blue channel Gain increases.
  const rGain = 1.0;
  const gGain = 1.0 + (mInput * SENSITIVITY);
  const bGain = 1.0 + (yInput * SENSITIVITY);

  // 3. Auto-Exposure Compensation (Normalization)
  // Find the highest gain to prevent clipping and dim the whole image accordingly.
  // Ensure we don't divide by zero or negative numbers (clamp at 0.1)
  const maxGain = Math.max(rGain, gGain, bGain, 0.1); 
  const dimFactor = 1.0 / maxGain;

  const R = Math.max(0, rGain * dimFactor);
  const G = Math.max(0, gGain * dimFactor);
  const B = Math.max(0, bGain * dimFactor);

  // 4. Construct Matrix
  // [ R 0 0 0 0 ]
  // [ 0 G 0 0 0 ]
  // [ 0 0 B 0 0 ]
  // [ 0 0 0 1 0 ]
  return [
    R.toFixed(3), 0, 0, 0, 0,
    0, G.toFixed(3), 0, 0, 0,
    0, 0, B.toFixed(3), 0, 0,
    0, 0, 0, 1, 0
  ].join(' ');
};

export const formatFiltration = (vals: ColorCorrection) => {
  const formatPart = (val: number, label: string) => {
    // Show signs for clarity
    const sign = val > 0 ? '+' : ''; 
    // Small threshold to hide noise
    if (Math.abs(val) < 0.5) return null;
    return `${sign}${Math.round(val)}${label}`;
  };

  const parts = [
    formatPart(vals.y, 'Y'),
    formatPart(vals.m, 'M'),
    formatPart(vals.c, 'C'),
  ].filter(Boolean);

  if (parts.length === 0) return "Neutral";
  return parts.join(' ');
};

/**
 * Converts an RGB color to Color Wheel Angle and Distance.
 * Used for "White Balance" picking.
 */
export const rgbToWheelPosition = (r: number, g: number, b: number) => {
  const rN = r / 255;
  const gN = g / 255;
  const bN = b / 255;

  const max = Math.max(rN, gN, bN);
  const min = Math.min(rN, gN, bN);
  const delta = max - min;

  let h = 0;
  const s = max === 0 ? 0 : delta / max;

  if (delta !== 0) {
    if (max === rN) {
      h = ((gN - bN) / delta) % 6;
    } else if (max === gN) {
      h = (bN - rN) / delta + 2;
    } else {
      h = (rN - gN) / delta + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const angle = h * (Math.PI / 180);
  const distance = Math.min(s * 2.0, 1); 

  return { angle, distance };
};