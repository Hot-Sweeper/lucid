// Distance changes the update budget, never whether a visible desktop exists.
// Even the smallest visible screen refreshes every 50 ms. Close-ups stay at 60 Hz.
export function screenFrameRate(width: number) {
  return width < 200 ? 20 : width < 450 ? 30 : 60;
}
