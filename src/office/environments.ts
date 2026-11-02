import "./environments.css";

export type EnvironmentBuilding = {
  id: string; label: string; local: boolean; status: "reachable" | "unreachable" | "expired" | "unknown";
  canOpen: boolean; reason: string | null;
};
export type EnvironmentInventory = {
  localId: string; buildings: EnvironmentBuilding[]; error: string | null;
  connectionState: "no-linked-environments" | "remote-feed-unavailable" | "inventory-unavailable" | "available";
};

/** Building inventory reflects T3's real machines. Disabled remote rows never select local data. */
export function mountEnvironments(host: HTMLElement, load: (fresh?: boolean) => Promise<EnvironmentInventory>, select: (id: string) => void | Promise<void>, inventory?: (data: EnvironmentInventory, open: (id: string) => void) => void) {
  const root = document.createElement("section"); root.className = "environments";
  const head = document.createElement("div"); head.className = "sec-head";
  const title = document.createElement("h3"); title.textContent = "Buildings";
  const retry = document.createElement("button"); retry.type = "button"; retry.className = "link-btn"; retry.textContent = "Refresh"; retry.title = "Refresh connected computers from T3 Code";
  head.append(title, retry);
  const list = document.createElement("div"); list.className = "environment-list";
  const note = document.createElement("p"); note.className = "environment-note"; note.textContent = "Reading buildings";
  root.append(head, list, note); host.append(root);
  const rows = new Map<string, { button: HTMLButtonElement; name: HTMLElement; state: HTMLElement; building: EnvironmentBuilding }>();
  let destroyed = false, sequence = 0, choosing = false, selectedId: string | null = null, openingId: string | null = null;
  let loading: Promise<void> | null = null;
  async function read(fresh: boolean) {
    const own = ++sequence;
    try {
      const data = await load(fresh);
      if (destroyed || own !== sequence) return;
      inventory?.(data, id => rows.get(id)?.button.click());
      const keep = new Set(data.buildings.map(b => b.id));
      for (const [id, row] of rows) if (!keep.has(id)) { row.button.remove(); rows.delete(id); }
      data.buildings.forEach((building, index) => {
        let row = rows.get(building.id);
        if (!row) {
          const button = document.createElement("button"); button.type = "button"; button.className = "environment-row";
          const name = document.createElement("b"), state = document.createElement("span"); button.append(name, state);
          const entry = { button, name, state, building };
          button.addEventListener("click", async () => {
            if (button.disabled || choosing) return;
            choosing = true; openingId = entry.building.id;
            button.disabled = true; note.hidden = false; note.textContent = 'Opening building…';
            try {
              await select(entry.building.id);
              if (destroyed) return;
              selectedId = entry.building.id; list.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', b === button ? 'location' : 'false')); note.hidden = true;
            }
            catch (e) { if (!destroyed) { note.textContent = e instanceof Error ? e.message : 'Building could not be opened. Try again.'; note.hidden = false; } }
            finally { choosing = false; openingId = null; button.disabled = !entry.building.canOpen; }
          });
          row = entry; rows.set(building.id, row);
        }
        row.building = building;
        row.name.textContent = building.label;
        row.button.disabled = !building.canOpen || openingId === building.id;
        row.button.setAttribute("aria-current", building.id === (selectedId || data.localId) ? "location" : "false");
        row.state.textContent = building.local ? "This computer" : building.status === "expired" ? "Link expired in T3 Code" : building.status === "unreachable" ? "Offline in T3 Code" : building.canOpen ? 'Open building' : "Lucid connection needed";
        row.button.title = building.reason || `Show ${building.label}`;
        if (list.children[index] !== row.button) list.insertBefore(row.button, list.children[index] || null);
      });
      if (!choosing) {
        note.textContent = data.error || (data.connectionState === "no-linked-environments" ? "Other machines must be linked in T3 Code." : data.connectionState === "remote-feed-unavailable" ? "Remote buildings need an authenticated Lucid connection." : "");
        note.hidden = !note.textContent;
      }
    } catch {
      if (destroyed || own !== sequence) return;
      if (!choosing) { note.textContent = "Buildings could not be read from T3 Code."; note.hidden = false; }
    }
  }
  function refresh(fresh = false): Promise<void> {
    if (destroyed) return Promise.resolve();
    if (loading) return loading;
    retry.disabled = true;
    loading = read(fresh).finally(() => { loading = null; if (!destroyed) retry.disabled = false; });
    return loading;
  }
  retry.addEventListener("click", () => void refresh(true));
  const visible = () => { if (!document.hidden) void refresh(); };
  const timer = window.setInterval(visible, 60000); document.addEventListener("visibilitychange", visible);
  void refresh();
  return { refresh, destroy() { destroyed = true; sequence++; clearInterval(timer); document.removeEventListener("visibilitychange", visible); root.remove(); } };
}
