// Analysis uses a small working bitmap; the displayed image retains its original pixels.
export function analysisSize(width: number, height: number) {
  const scale = Math.min(1, 960 / width, 960 / height);
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

/** Break image analysis into short tasks so input and animation can run between them. */
export function sheetAnalysisBudget(
  valid: () => boolean,
  now: () => number = () => performance.now(),
  yieldTask: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 0)),
) {
  let since = now();
  return async () => {
    if (!valid()) throw new Error("Image analysis cancelled");
    if (now() - since >= 4) {
      await yieldTask();
      if (!valid()) throw new Error("Image analysis cancelled");
      since = now();
    }
  };
}
