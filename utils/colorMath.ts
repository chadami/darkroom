import { ColorCorrection } from '../types';

/**
 * Normalizes a filter pack to a 2-filter system where Cyan is locked to 0.
 * In RA-4 printing, adding Cyan is equivalent to subtracting Yellow and Magenta 
 * (relative to the neutral axis).
 */
export const normalizeToYM = (c: number, m: number, y: number): ColorCorrection => {
  // We want the final C to be 0.
  // We shift the entire filter pack by subtracting the C value from all channels.
  // New C = C - C = 0
  // New M = M - C
  // New Y = Y - C
  
  // Example: Needed +10C (Red correction).
  // Result: -10M, -10Y. (Removing Y/M filters lets more Red light through -> Cyan print).
  
  return {
    c: 0,
    m: Math.round((m - c) * 10) / 10,
    y: Math.round((y - c) * 10) / 10
  };
};

/**
 * Calculates the Filter Adjustment (YMC) based on a visual correction vector.
 * Returns values optimized for a Y/M only workflow (C=0).
 */
export const calculateFiltration = (angleRad: number, distance: number): ColorCorrection => {
  const MAX_FILTRATION = 50; 
  const strength = Math.min(distance, 1) * MAX_FILTRATION;

  // Visual Vector components
  const x = Math.cos(angleRad) * strength;
  const y = Math.sin(angleRad) * strength;

  // Projection Axes (Unit vectors)
  // C+ Axis (Red/Right): 0 deg
  const cAxis = { x: 1, y: 0 };
  
  // M+ Axis (Green/Bottom-Left): 120 deg
  const mAxis = { x: Math.cos(2 * Math.PI / 3), y: Math.sin(2 * Math.PI / 3) };
  
  // Y+ Axis (Blue/Top-Left): 240 deg
  const yAxis = { x: Math.cos(4 * Math.PI / 3), y: Math.sin(4 * Math.PI / 3) };

  // Calculate raw theoretical values for a 3-filter system
  const cRaw = (x * cAxis.x) + (y * cAxis.y);
  const mRaw = (x * mAxis.x) + (y * mAxis.y);
  const yRaw = (x * yAxis.x) + (y * yAxis.y);

  // Normalize to lock C at 0 for the user output
  return normalizeToYM(cRaw, mRaw, yRaw);
};

/**
 * Generates an SVG feColorMatrix string based on the user's correction.
 * This filters the image visually in the browser.
 */
export const getSVGFilterMatrix = (angleRad: number, distance: number): string => {
  // Intensity of the visual cast
  // Increased slightly to ensure visibility
  const intensity = Math.min(distance, 1) * 0.6; 
  
  // Calculate RGB Additive Offsets
  // 0 rad = Red
  // 2pi/3 = Green
  // 4pi/3 = Blue
  const rShift = Math.max(0, Math.cos(angleRad)) * intensity;
  const gShift = Math.max(0, Math.cos(angleRad - (2 * Math.PI / 3))) * intensity;
  const bShift = Math.max(0, Math.cos(angleRad - (4 * Math.PI / 3))) * intensity;

  // Format: R G B A Offset (5 columns)
  // We strictly use space separation and a single line
  return [
    1, 0, 0, 0, rShift,
    0, 1, 0, 0, gShift,
    0, 0, 1, 0, bShift,
    0, 0, 0, 1, 0
  ].join(' ');
};

// Formats the output for the UI
export const formatFiltration = (vals: ColorCorrection) => {
  const formatPart = (val: number, label: string) => {
    if (Math.abs(val) < 0.5) return null;
    const sign = val > 0 ? '+' : ''; 
    return `${sign}${Math.round(val)}${label}`;
  };

  const parts = [
    formatPart(vals.y, 'Y'),
    formatPart(vals.m, 'M'),
    // C is excluded if it's 0, which it now always is.
    formatPart(vals.c, 'C'),
  ].filter(Boolean);

  if (parts.length === 0) return "Neutral";
  return parts.join(' ');
};