export type Bit = 0 | 1;

export type Phase = typeof Phases[number];

export const Phases = ['A', 'B', 'C', 'D'] as const;

export interface ZeroCrossing {
    side: 1 | -1;
    timestamp: number;
    delta: number;
}

export const carrierHz = 7800;