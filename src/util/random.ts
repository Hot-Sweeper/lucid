// Unseeded randomness for cosmetic variety (never for persistent identity: see robot/look.ts seeded()).
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
