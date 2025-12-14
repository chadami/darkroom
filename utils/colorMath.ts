import { ColorCorrection } from '../types';

export const MAX_FILTRATION = 50;
const SENSITIVITY = 4.0; // Matches the factor in getSVGFilterMatrix

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

  return normalizeToYM(cVal, mVal, yVal);
};

/**
 * Helper to calculate gains and dim factor based on wheel position.
 * Used by both SVG generation and Eyedropper math.
 */
export const getFilterGains = (angleRad: number, distance: number) => {
  const strength = Math.min(distance, 1);

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
  const maxGain = Math.max(rGain, gGain, bGain, 0.1); 
  const dimFactor = 1.0 / maxGain;

  return { rGain, gGain, bGain, dimFactor };
};

/**
 * Generates an SVG feColorMatrix string simulating RA-4 Filter effects.
 */
export const getSVGFilterMatrix = (angleRad: number, distance: number): string => {
  const { rGain, gGain, bGain, dimFactor } = getFilterGains(angleRad, distance);

  const R = Math.max(0, rGain * dimFactor);
  const G = Math.max(0, gGain * dimFactor);
  const B = Math.max(0, bGain * dimFactor);

  return [
    R.toFixed(3), 0, 0, 0, 0,
    0, G.toFixed(3), 0, 0, 0,
    0, 0, B.toFixed(3), 0, 0,
    0, 0, 0, 1, 0
  ].join(' ');
};

/**
 * Calculates a new wheel position to neutralize a selected pixel.
 * Uses strict RA-4 physics:
 * - Low Blue (Yellowish) -> Add Y Filter (Boost Blue)
 * - Low Green (Magentish) -> Add M Filter (Boost Green)
 */
export const calculateCorrectionFromPoint = (
  origR: number, 
  origG: number, 
  origB: number, 
  currentAngle: number, 
  currentDistance: number
) => {
  // 1. Determine what color the user is currently SEEING (Apply current filter)
  const { rGain, gGain, bGain, dimFactor } = getFilterGains(currentAngle, currentDistance);

  const visR = origR * rGain * dimFactor;
  const visG = origG * gGain * dimFactor;
  const visB = origB * bGain * dimFactor;

  // 2. Calculate deviation from Neutral Gray
  const avg = (visR + visG + visB) / 3;
  
  // 3. Calculate RGB Differences
  // If visBlue < avg (Yellow cast), diffB is positive.
  // If visGreen < avg (Magenta cast), diffG is positive.
  const diffB = avg - visB; 
  const diffG = avg - visG;

  // 4. Convert RGB diff to Filter Units
  // Sensitivity factor: How many filter units per RGB unit?
  // 0.4 is an empirical factor for smooth convergence.
  const CORRECTION_SCALE = 0.4; 
  
  // Correction Logic:
  // If diffB > 0 (Yellow cast), we need to Add Yellow Filter (Y+) to boost Blue.
  // If diffG > 0 (Magenta cast), we need to Add Magenta Filter (M+) to boost Green.
  const corrY = diffB * CORRECTION_SCALE;
  const corrM = diffG * CORRECTION_SCALE;

  // 5. Convert Corrections to Vectors
  // Yellow Vector @ 60 degrees
  const yAxisAngle = 60 * (Math.PI / 180);
  const vY_x = Math.cos(yAxisAngle) * corrY;
  const vY_y = Math.sin(yAxisAngle) * corrY;

  // Magenta Vector @ 300 degrees
  const mAxisAngle = 300 * (Math.PI / 180);
  const vM_x = Math.cos(mAxisAngle) * corrM;
  const vM_y = Math.sin(mAxisAngle) * corrM;

  // 6. Current Vector (from wheel position)
  // We need the denormalized distance (0 to MAX_FILTRATION)
  const currentStrength = Math.min(currentDistance, 1) * MAX_FILTRATION;
  const currX = Math.cos(currentAngle) * currentStrength;
  const currY = Math.sin(currentAngle) * currentStrength;

  // 7. Sum Vectors to get New Target
  const targetX = currX + vY_x + vM_x;
  const targetY = currY + vY_y + vM_y;

  // 8. Convert back to Angle/Distance (0-1)
  const newAngle = Math.atan2(targetY, targetX);
  const newMag = Math.sqrt(targetX * targetX + targetY * targetY);
  const newDistance = Math.min(newMag / MAX_FILTRATION, 1.0); // Clamp to max radius

  return {
    angle: newAngle,
    distance: newDistance,
    correction: { y: corrY, m: corrM }
  };
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