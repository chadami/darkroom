export interface ColorCorrection {
  y: number;
  m: number;
  c: number;
}

export interface AnalysisResult {
  description: string;
  suggestion: ColorCorrection;
}

export interface ImageState {
  originalSrc: string | null;
  rotation: number;
}
