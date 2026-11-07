import "./app-library.css";
export function mountAppLibraryButton(neighbor: HTMLElement) {
  const button = document.createElement("button");
  button.type = "button"; button.id = "app-library-button"; button.className = "ghost side-help app-library-button";
  button.title = "App library"; button.setAttribute("aria-label", "App library"); button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-controls", "app-library");
  button.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="2" y="2" width="4" height="4" rx=".7"/><rect x="10" y="2" width="4" height="4" rx=".7"/><rect x="2" y="10" width="4" height="4" rx=".7"/><rect x="10" y="10" width="4" height="4" rx=".7"/></svg>';
  neighbor.before(button);
  let loading = false;
  button.addEventListener("click", async () => {
    if (loading) return;
    loading = true; button.setAttribute("aria-busy", "true");
    try { (await import("./app-library")).openAppLibrary(button); }
    catch { button.title = "Could not load app library. Click to retry."; }
    finally { loading = false; button.removeAttribute("aria-busy"); }
  });
}
