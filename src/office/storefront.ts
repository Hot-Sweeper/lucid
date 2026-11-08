import './storefront.css';
import { localizeGameDOM } from '../localization-dom';
import { CATALOG, coinIcon, currentSeason, itemPreview, type ShopItem, type Wallet } from './shop';
import { ROOM_STYLES, computerPreview, type ComputerId } from './appearances';
import { WALLS, drawFloor, type DecorId, type FloorId, type WallId } from '../decor/decor';
import type { RoomTheme } from './decorate';
import { gameSound } from './sound';
import { formatCoins } from './coin-ledger';

export type StoreOptions = {
  wallet: Wallet; level: number;
  rooms?: () => { id: string; title: string; theme: RoomTheme; desks: { id: string; title: string }[] }[];
  onEquip?: (room: string, theme: RoomTheme) => Promise<void>;
  onBought?: (item: ShopItem) => void | Promise<void>;
};
let current: { close: () => void } | null = null;
let lastView = { category: 'Themes', ownedOnly: false, search: '', room: '', desk: '', scroll: 0 };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const styleKeys = (s: typeof ROOM_STYLES[number]) => [`floor:${s.floor}`, `wall:${s.wall}`, `computer:${s.computer}`];

export function openStorefront(o: StoreOptions) {
  if (current) { current.close(); return; }
  const scene = document.getElementById('scene'), host = scene?.parentElement;
  if (!scene || !host) return;
  window.dispatchEvent(new Event('lucid:center-view'));
  const before = document.activeElement as HTMLElement | null, wasInert = scene.inert;
  const el = document.createElement('section'); el.className = 'lucid-store'; el.setAttribute('aria-labelledby', 'store-title');
  el.innerHTML = `<header class="ls-head"><div><h2 id="store-title">Lucid Supply</h2><p>Make every office your own.</p></div><div class="ls-balance">${coinIcon(20)}<b></b></div><button type="button" class="ghost" data-close>Back to office</button></header>
    <div class="ls-tools"><label>Search the store<input type="search" placeholder="Computers, plants, floors…"></label><label>Equip in<select data-room data-no-localize></select></label><label data-desk-label>Computer placement<select data-desk></select></label></div>
    <nav class="ls-tabs" aria-label="Store categories"></nav><div class="ls-body"><p class="ls-note"></p><div class="ls-grid"></div></div><footer><span role="status" class="ls-status">Purchases stay yours across all your offices.</span><span>Earn coins by collecting finished work.</span></footer>`;
  const grid = el.querySelector<HTMLElement>('.ls-grid')!, search = el.querySelector<HTMLInputElement>('input')!, room = el.querySelector<HTMLSelectElement>('[data-room]')!, desk = el.querySelector<HTMLSelectElement>('[data-desk]')!;
  let category = lastView.category, ownedOnly = lastView.ownedOnly, busy = false;
  search.value = lastView.search;
  const rooms = () => o.rooms?.() ?? [];
  const selectedRoom = () => rooms().find(r => r.id === room.value);
  const placement = () => {
    const prev = desk.value;
    desk.innerHTML = `<option value="">All computers in this office</option>` + (selectedRoom()?.desks ?? []).map(d => `<option value="${esc(d.id)}">${esc(d.title)}</option>`).join('');
    if ([...desk.options].some(x => x.value === prev)) desk.value = prev;
  };
  room.innerHTML = rooms().map(r => `<option value="${esc(r.id)}">${esc(r.title)}</option>`).join('') || '<option value="">No office available</option>';
  if ([...room.options].some(x => x.value === lastView.room)) room.value = lastView.room;
  placement();
  if ([...desk.options].some(x => x.value === lastView.desk)) desk.value = lastView.desk;
  const message = (text: string) => { el.querySelector('.ls-status')!.textContent = text; };
  const active = (it: ShopItem) => {
    const t = selectedRoom()?.theme;
    if (it.kind === 'computer') return (desk.value ? t?.computers?.[desk.value] ?? t?.computer : t?.computer) === it.id || it.id === 'classic' && !(desk.value ? t?.computers?.[desk.value] ?? t?.computer : t?.computer);
    if (it.kind === 'decor') return !!t?.decor?.includes(it.id as DecorId);
    return t?.[it.kind] === it.id;
  };
  const cost = (keys: string[]) => keys.reduce((n, key) => n + (o.wallet.owns(key) ? 0 : CATALOG.find(it => it.key === key)!.price), 0);
  const paint = () => {
    el.querySelector('.ls-balance b')!.textContent = `${formatCoins(o.wallet.balance)} coins`;
    el.querySelector<HTMLElement>('[data-desk-label]')!.hidden = category !== 'Computers';
    el.querySelector('.ls-note')!.textContent = category === 'Themes' ? 'Coordinated floors, walls and computers. Pay only for missing pieces. Equipping replaces individual computer choices and keeps decorations.' : category === 'Seasonal' ? 'Seasonal pieces stay yours all year. Equip owned pieces in any season.' : 'Choose a piece, then equip it in your office.';
    const q = search.value.trim().toLocaleLowerCase();
    if (category === 'Themes') {
      grid.innerHTML = ROOM_STYLES.filter(s => s.name.toLocaleLowerCase().includes(q) && (!ownedOnly || styleKeys(s).every(k => o.wallet.owns(k)))).map(s => {
        const price = cost(styleKeys(s)), equipped = selectedRoom()?.theme;
        const on = equipped?.floor === s.floor && equipped?.wall === s.wall && (equipped?.computer ?? 'classic') === s.computer && !Object.keys(equipped?.computers ?? {}).length;
        return `<article class="ls-item"><div class="ls-room-preview" style="--wall:${WALLS[s.wall].face};--trim:${WALLS[s.wall].trim}"><svg viewBox="0 0 220 70" aria-hidden="true">${drawFloor(s.floor, 220, 70, 0)}</svg>${computerPreview(s.computer)}</div><h3>${s.name}</h3><p>${FLOOR_LABEL(s.floor)} · ${WALLS[s.wall].name}</p><button type="button" class="${price ? 'primary' : 'ghost'}" data-style="${s.id}" ${busy || price > o.wallet.balance || !room.value || !o.onEquip ? 'disabled' : ''}>${price ? `Buy &amp; equip · ${formatCoins(price)} coins` : on ? 'Equipped' : 'Equip collection'}</button>${price > o.wallet.balance ? `<small>${formatCoins(price - o.wallet.balance)} more coins needed</small>` : ''}</article>`;
      }).join('');
    } else {
      const kinds: Record<string,string> = { Computers: 'computer', Furniture: 'decor', Floors: 'floor', Walls: 'wall' };
      grid.innerHTML = CATALOG.filter(it => (category === 'Seasonal' ? !!it.season : it.kind === kinds[category] && !it.season) && it.name.toLocaleLowerCase().includes(q) && (!ownedOnly || o.wallet.owns(it.key))).map(it => {
        const own = o.wallet.owns(it.key), on = own && active(it), locked = it.level > o.level, off = !!it.season && it.season !== currentSeason() && !own;
        const text = own ? on ? it.kind === 'decor' ? 'Remove from office' : 'Equipped' : 'Equip' : locked ? `Unlocks at level ${it.level}` : off ? `Available in ${it.season}` : `Buy · ${formatCoins(it.price)} coins`;
        return `<article class="ls-item"><div class="ls-preview">${itemPreview(it, 160, 112)}</div><h3>${esc(it.name)}</h3><p>${own ? 'Owned' : it.kind === 'computer' ? 'Computer casing' : 'For your office'}</p><button type="button" data-item="${it.key}" class="${own ? 'ghost' : 'primary'}" ${busy || locked || off || (!own && it.price > o.wallet.balance) || (own && (!room.value || !o.onEquip)) ? 'disabled' : ''}>${text}</button>${!own && it.price > o.wallet.balance ? `<small>${formatCoins(it.price - o.wallet.balance)} more coins needed</small>` : ''}</article>`;
      }).join('');
    }
    if (!grid.children.length) grid.innerHTML = '<p class="ls-empty">No matching items. Try another search or turn off Owned only.</p>';
  };
  for (const name of ['Themes', 'Computers', 'Furniture', 'Floors', 'Walls', 'Seasonal', 'Owned only']) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = name; b.dataset.category = name;
    const update = () => { for (const x of el.querySelectorAll('.ls-tabs button')) x.setAttribute('aria-pressed', String((x as HTMLElement).dataset.category === 'Owned only' ? ownedOnly : (x as HTMLElement).dataset.category === category)); };
    b.addEventListener('click', () => { if (busy) return; if (name === 'Owned only') ownedOnly = !ownedOnly; else category = name; update(); paint(); gameSound.play('switch'); });
    el.querySelector('nav')!.append(b); update();
  }
  const equip = async (t: RoomTheme) => { if (o.onEquip && room.value) await o.onEquip(room.value, t); };
  grid.addEventListener('click', async e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button'); if (!b || b.disabled || busy) return;
    const id = b.dataset.item ?? b.dataset.style!;
    busy = true;
    for (const x of el.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) x.disabled = true;
    const theme = structuredClone(selectedRoom()?.theme ?? {});
    try {
      if (b.dataset.style) {
        const s = ROOM_STYLES.find(s => s.id === id)!;
        const price = cost(styleKeys(s));
        if (!o.wallet.buyMany(styleKeys(s))) { message('Could not buy this collection. Check your balance and try again.'); return; }
        if (price) { gameSound.play('purchase'); await o.onBought?.(CATALOG.find(it => it.key === `computer:${s.computer}`)!); }
        await equip({ ...theme, floor: s.floor, wall: s.wall, computer: s.computer, computers: {} }); message(`${s.name} equipped in ${selectedRoom()?.title}.`);
      } else {
        const it = CATALOG.find(it => it.key === id)!;
        if (!o.wallet.owns(id)) {
          if (!o.wallet.buy(id)) { message('Could not buy this item. Check your balance and try again.'); return; }
          gameSound.play('purchase'); await o.onBought?.(it); message(`${it.name} purchased. Choose Equip to place it.`);
        } else {
          if (it.kind === 'computer') {
            if (desk.value) theme.computers = { ...theme.computers, [desk.value]: it.id as ComputerId };
            else { theme.computer = it.id as ComputerId; theme.computers = {}; }
          } else if (it.kind === 'decor') theme.decor = active(it) ? theme.decor?.filter(d => d !== it.id) : [...(theme.decor ?? []), it.id as DecorId];
          else if (it.kind === 'floor') theme.floor = it.id as FloorId;
          else theme.wall = it.id as WallId;
          await equip(theme); gameSound.play('switch'); message(`${it.name} updated in ${selectedRoom()?.title}.`);
        }
      }
    } catch { message('Could not save your changes. Your purchases remain in Owned only. Please retry.'); }
    finally { busy = false; for (const x of el.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")) x.disabled = false; if (el.isConnected) { paint(); el.querySelector<HTMLButtonElement>(`[data-item="${id}"], [data-style="${id}"]`)?.focus({ preventScroll: true }); } }
  });
  const close = () => {
    window.removeEventListener('lucid:center-view', close); window.removeEventListener('keydown', key, true); window.removeEventListener('lucid:wallet-change', paint);
    lastView = { category, ownedOnly, search: search.value, room: room.value, desk: desk.value, scroll: el.querySelector('.ls-body')!.scrollTop };
    unlocalize(); el.remove(); current = null; host.classList.remove('store-open'); scene.inert = wasInert; before?.isConnected && before.focus({ preventScroll: true });
  };
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.querySelector('.dialog-wrap')) { e.preventDefault(); e.stopImmediatePropagation(); close(); } };
  window.addEventListener('lucid:center-view', close); window.addEventListener('keydown', key, true); window.addEventListener('lucid:wallet-change', paint);
  room.addEventListener('change', () => { placement(); paint(); }); desk.addEventListener('change', paint); search.addEventListener('input', paint);
  el.querySelector('[data-close]')!.addEventListener('click', close);
  const unlocalize = localizeGameDOM(el, 'Lucid cosmetic office store. Translate controls and item descriptions. Keep office and robot names unchanged.');
  current = { close }; host.append(el); scene.inert = true; host.classList.add('store-open'); paint(); el.querySelector('.ls-body')!.scrollTop = lastView.scroll; search.focus({ preventScroll: true }); gameSound.play('open');
}
function FLOOR_LABEL(id: FloorId) { return ({ wood: 'Honey planks', oak: 'Oak parquet', carpet: 'Carpet tiles', tiles: 'Ceramic tiles', concrete: 'Polished concrete', terrazzo: 'Terrazzo' })[id]; }
