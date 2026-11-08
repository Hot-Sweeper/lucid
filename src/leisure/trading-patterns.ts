// Robot chart doodles, drawn over the market without changing any candle data.
export type ChartPoint = [number, number];
export const PATTERNS = ['dinosaur', 'god-candle', 'spaghetti', 'trust-me-bro'] as const;
export type PatternKind = typeof PATTERNS[number];
export type ChartPattern = { title: string; verdict: string; strokes: ChartPoint[][] };

/** Coordinates occupy the plot, never its price or time axes. */
export function chartPattern(kind: PatternKind, candle: ChartPoint = [.8, .4]): ChartPattern {
  if (kind === 'dinosaur') return {
    title: 'Dinosaur pattern', verdict: 'Tiny arms. Massive upside.',
    strokes: [
      [[.05,.61],[.2,.63],[.32,.42],[.5,.4],[.57,.22],[.57,.13],[.86,.13],[.91,.19],[.91,.28],[.74,.28],[.75,.32],[.88,.32],[.88,.38],[.69,.38],[.66,.5],[.72,.5],[.74,.56],[.65,.56],[.6,.64],[.61,.79],[.69,.79],[.69,.85],[.55,.85],[.5,.67],[.44,.72],[.39,.84],[.29,.84],[.29,.78],[.35,.77],[.35,.67],[.24,.7],[.05,.61]],
      [[.78,.19],[.79,.19]],
      [[.81,.28],[.81,.31]],
      [[.85,.28],[.85,.31]],
    ],
  };
  if (kind === 'god-candle') {
    const x = Math.max(.08, Math.min(.92, candle[0]));
    const y = Math.max(.24, Math.min(.84, candle[1]));
    const halo: ChartPoint[] = Array.from({length:25}, (_, i) => {
      const angle = i / 24 * Math.PI * 2;
      return [x + Math.cos(angle) * .055, y + Math.sin(angle) * .07];
    });
    return {title:'God candle analysis',verdict:'One candle. All my research.',strokes:[halo,[[x-.07,y-.09],[x-.07,y-.16]],[[x,y-.1],[x,y-.19]],[[x+.07,y-.09],[x+.07,y-.16]]]};
  }
  if (kind === 'spaghetti') return {
    title:'Spaghetti divergence', verdict:'The noodles are converging. Probably.',
    strokes:[Array.from({length:55},(_,i)=>{const t=i/54;return [.08+t*.82,.48+Math.sin(t*Math.PI*7)*.23+Math.cos(t*Math.PI*13)*.06];})],
  };
  return {
    title:'Trust-me-bro projection',verdict:'Source: it came to me in sleep mode.',
    strokes:[[[.08,.7],[.21,.6],[.29,.69],[.4,.5],[.5,.58],[.61,.39],[.7,.5],[.87,.15]],[[.73,.17],[.87,.15],[.88,.32]]],
  };
}
