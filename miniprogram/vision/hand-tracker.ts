export type NormalizedPoint = { x: number; y: number };
export type HandLandmark = NormalizedPoint & { z: number };
export type HandResult = { landmarks: HandLandmark[]; cursor: NormalizedPoint; detected: boolean };
