// Sliders (controls.css) draw their filled part from --fill; this keeps it in step with the value.
export function rangeFill(input: HTMLInputElement) {
  const paint = () => {
    const min = Number(input.min) || 0, max = Number(input.max || 100), span = max - min || 1;
    input.style.setProperty("--fill", `${((Number(input.value) - min) / span) * 100}%`);
  };
  input.addEventListener("input", paint);
  paint();
}
