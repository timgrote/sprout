export interface Point { x: number; y: number; }

export interface Particle {
  pos: Point;
  vel: Point;
  radius: number;
  settled: boolean;
  target: Point;
  edgeIndex: number;
  type: 'perimeter' | 'interior';
}

export interface TargetInfo { pos: Point; edgeIndex: number; }
