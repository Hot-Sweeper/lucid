import "./environments.css";

export type EnvironmentBuilding = {
  id: string; label: string; local: boolean; status: "reachable" | "unreachable" | "expired" | "unknown";
  canOpen: boolean; reason: string | null;
};
export type EnvironmentInventory = {
  localId: string; buildings: EnvironmentBuilding[]; error: string | null;
  connectionState: "no-linked-environments" | "remote-feed-unavailable" | "inventory-unavailable";
};

/** Building inventory reflects T3's real machines. Disabled remote rows never select local data. */
export function mountEnvironments(host: HTMLElement, load: (fresh?: boolean) => Promise<EnvironmentInventory>, select: (id: string) => void) {
  const root = document.createElement("section"); root.className = "environments";
  const head = document.createElement("div"); head.className = "sec-head";
  const title = document.createElement("h3"); title.textContent = "Buildings";
  const retry = document.createElement("button"); retry.type = "button"; retry.className = "link-btn"; retry.textContent = "Retry"; retry.hidden = true;
  head.append(title, retry);
  const list = document.createElement("div"); list.className = "environment-list";
  const note = document.createElement("p"); note.className = "environment-note"; note.textContent = "Reading buildings";
  root.append(head, list, note); host.append(root);
  const rows = new Map<string, { button: HTMLButtonElement; name: HTMLElement; state: HTMLElement }>();
  let destroyed = false, sequence = 0;
  async function refresh(fresh = false) {
    const own = ++sequence;
    try {
      const data = await load(fresh);
      if (destroyed || own !== sequence) return;
      const keep = new Set(data.buildings.map(b => b.id));
      for (const [id, row] of rows) if (!keep.has(id)) { row.button.remove(); rows.delete(id); }
      data.buildings.forEach((building, index) => {
        let row = rows.get(building.id);
        if (!row) {
          const button = document.createElement("button"); button.type = "button"; button.className = "environment-row";
          const name = document.createElement("b"), state = document.createElement("span"); button.append(name, state);
          button.addEventListener("click", () => { if (!button.disabled) select(building.id); });
          row = { button, name, state }; rows.set(building.id, row);
        }
        row.name.textContent = building.label;
        row.button.disabled = !building.canOpen;
        row.button.setAttribute("aria-current", building.id === data.localId ? "location" : "false");
        row.state.textContent = building.local ? "Current building" : building.status === "expired" ? "Link expired in T3 Code" : building.status === "unreachable" ? "Offline in T3 Code" : "Lucid connection needed";
        row.button.title = building.local ? `Show ${building.label}` : building.reason || "Connect this building through T3 Code.";
        if (list.children[index] !== row.button) list.insertBefore(row.button, list.children[index] || null);
      });
      note.textContent = data.error || (data.connectionState === "no-linked-environments" ? "Other machines must be linked in T3 Code." : data.connectionState === "remote-feed-unavailable" ? "Remote buildings need an authenticated Lucid connection." : "");
      note.hidden = !note.textContent; retry.hidden = !data.error;
    } catch {
      if (destroyed || own !== sequence) return;
      note.textContent = "Buildings could not be read from T3 Code."; note.hidden = false; retry.hidden = false;
    }
  }
  retry.addEventListener("click", () => void refresh(true));
  const visible = () => { if (!document.hidden) void refresh(); };
  const timer = window.setInterval(visible, 60000); document.addEventListener("visibilitychange", visible);
  void refresh();
  return { refresh, destroy() { destroyed = true; sequence++; clearInterval(timer); document.removeEventListener("visibilitychange", visible); root.remove(); } };
}
