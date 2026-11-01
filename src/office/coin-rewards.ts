import gsap from 'gsap';
import type { World, WorldData } from './world';
import { Wallet, coinIcon } from './shop';
import { formatCoins, type CoinSource } from './coin-ledger';
import { gameSound } from './sound';
import './coin-rewards.css';

export class CoinRewards {
  private tray = document.createElement('div');
  private disclosure = document.createElement('details');
  private summary = document.createElement('summary');
  private list = document.createElement('div');
  private status = document.createElement('span');
  private collectAllButton = document.createElement('button');
  private deskButtons = new Map<HTMLElement, HTMLButtonElement>();
  private rows = new Map<string, HTMLButtonElement>();
  private effects = new Map<HTMLElement, gsap.core.Timeline>();
  private pending: Promise<void> | null = null;
  private completionStamp = '';
  private settling = new Set<string>();
  private disposed = false;
  private timer: number;
  private seen = new Set<string>();
  private initialized = false;
  constructor(private wallet: Wallet, private world: World, private load: () => Promise<{ usage: Parameters<Wallet['observe']>[0]; sources: CoinSource[] }>) {
    this.tray.className = 'coin-tray'; this.tray.hidden = true;
    this.summary.textContent = 'Coins to collect';
    this.list.className = 'coin-reward-list';
    this.status.className = 'coin-announcement';
    this.status.setAttribute('role', 'status');
    this.collectAllButton.type = 'button'; this.collectAllButton.className = 'coin-collect-all';
    this.collectAllButton.textContent = 'Collect all';
    this.collectAllButton.addEventListener('click', () => this.collectAll());
    this.disclosure.append(this.summary, this.list);
    this.tray.append(this.disclosure, this.collectAllButton);
    this.tray.addEventListener('pointerdown', e => e.stopPropagation());
    this.tray.addEventListener('click', e => e.stopPropagation());
    this.tray.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
    this.tray.addEventListener('keydown', e => { if (e.key === 'Escape' && this.disclosure.open) { e.stopPropagation(); this.disclosure.open = false; this.summary.focus(); } });
    this.world.scene.append(this.tray, this.status);
    this.timer = window.setInterval(() => { if (!document.hidden) void this.refresh(); }, 15000);
    document.addEventListener('visibilitychange', this.visibility);
    window.addEventListener('pagehide', this.destroy);
    void this.refresh();
  }
  private visibility = () => {
    if (document.hidden) { this.clearEffects(); this.initialized = false; }
    else void this.refresh();
    for (const button of this.deskButtons.values()) button.classList.toggle('coin-motion-paused', document.hidden);
  };
  prepare(data: WorldData) {
    if (data.environmentId) return;
    const stamp = data.threads.filter(t => t.runStatus === 'completed').map(t => `${t.id}:${t.updatedAt}`).sort().join('|');
    if (stamp === this.completionStamp) return;
    this.completionStamp = stamp;
    for (const t of data.threads) if (t.runStatus === 'completed' && this.world.desks.has(t.id)) this.settling.add(t.id);
    this.world.setCoinHolds([...this.wallet.rewards.map(r => r.id), ...this.settling]);
    void this.refresh();
  }
  refresh(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.pending) return this.pending;
    this.pending = this.read().finally(() => { this.pending = null; });
    return this.pending;
  }
  private async read() {
    try {
      const snapshot = await this.load();
      if (this.disposed) return;
      this.wallet.observe(snapshot.usage);
      this.wallet.observeSources(snapshot.sources);
      for (const id of this.settling) {
        const sources = snapshot.sources.filter(s => s.threadId === id);
        if (!sources.length || sources.some(s => s.status === 'completed')) this.settling.delete(id);
      }
      this.syncHolds();
      this.tray.removeAttribute('title');
      this.render();
    } catch {
      // Keep saved rewards usable through a temporary usage-reader outage.
      this.tray.title = 'Usage could not be refreshed. Saved coins are still available; Lucid will retry.';
      this.render();
    }
  }
  private syncHolds() {
    if (this.world.setCoinHolds([...this.wallet.rewards.map(r => r.id), ...this.settling]) && this.world.lastData) this.world.update(this.world.lastData);
  }
  render() {
    if (this.disposed || document.hidden) return;
    const rewards = this.wallet.rewards;
    const ready = new Map(rewards.map(r => [r.id, r]));
    const fresh = rewards.some(r => !this.seen.has(r.id));
    if (this.initialized && fresh) gameSound.play('ready');
    this.initialized = true; this.seen = new Set(ready.keys());
    const focused = document.activeElement;
    for (const [id, row] of this.rows) if (!ready.has(id)) { row.remove(); this.rows.delete(id); }
    for (const reward of rewards) {
      let row = this.rows.get(reward.id);
      if (!row) {
        row = document.createElement('button'); row.type = 'button'; row.className = 'coin-reward-row';
        row.innerHTML = `<span></span><b>${coinIcon(16)}<i></i></b>`;
        const id = reward.id, button = row;
        row.addEventListener('click', () => this.collect(id, button));
        this.rows.set(id, row); this.list.append(row);
      }
      row.querySelector('span')!.textContent = this.world.roster.byThread(reward.id)?.name || reward.title;
      row.querySelector('i')!.textContent = `Collect ${formatCoins(reward.amount)}`;
      row.setAttribute('aria-label', `Collect ${formatCoins(reward.amount)} coins from ${reward.title}`);
      row.title = reward.title;
    }
    this.tray.hidden = !rewards.length;
    this.summary.textContent = `${formatCoins(rewards.reduce((sum, r) => sum + r.amount, 0))} coins to collect`;
    this.collectAllButton.setAttribute('aria-label', `Collect all ${formatCoins(rewards.reduce((sum, r) => sum + r.amount, 0))} coins`);
    if (rewards.length === 0) this.disclosure.open = false;
    for (const [el, button] of this.deskButtons) {
      const desk = [...this.world.desks.values()].find(d => d.el === el);
      if (!el.isConnected || !desk?.threadId || !ready.has(desk.threadId) || this.world.lastData?.environmentId) {
        button.remove(); this.deskButtons.delete(el);
      }
    }
    if (!this.world.lastData?.environmentId) for (const [id, desk] of this.world.desks) {
      const reward = ready.get(id); if (!reward) continue;
      let button = this.deskButtons.get(desk.el);
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'desk-coins';
        button.innerHTML = `<span class="coin-rays" aria-hidden="true"></span><span class="coin-aura" aria-hidden="true"></span><span class="coin-screen-content"><span class="coin-screen-title">Work complete!</span><span class="desk-coin-stack" aria-hidden="true">${coinIcon(102)}${coinIcon(102)}${coinIcon(102)}</span><span class="coin-screen-total"><b></b><span>coins</span></span><span class="coin-screen-cost"></span><span class="coin-screen-action">Collect <span aria-hidden="true">\u2192</span></span></span><span class="coin-sparkles" aria-hidden="true">${Array.from({ length: 6 }, (_, i) => `<i style="--i:${i}"></i>`).join('')}</span>`;
        const target = button;
        button.addEventListener('pointerdown', e => e.stopPropagation());
        button.addEventListener('dblclick', e => e.stopPropagation());
        button.addEventListener('click', e => { e.stopPropagation(); this.collect(id, target); });
        desk.screen.append(button); this.deskButtons.set(desk.el, button);
        if (!document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          button.animate([{ transform: 'translateY(8px) scale(.8)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.8,.3,1.2)' });
        }
      }
      const amount = `+${formatCoins(reward.amount)}`;
      if (button.querySelector('b')!.textContent !== amount) {
        button.querySelector('b')!.textContent = amount;
        button.style.setProperty('--coin-amount-size', amount.length > 12 ? '42px' : '66px');
        if (!document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) button.querySelector('.coin-screen-total')!.animate([{ transform: 'scale(.88)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' });
      }
      button.querySelector('.coin-screen-cost')!.textContent = `$${reward.dollars.toFixed(2)} at API prices${reward.amount - reward.dollars > .009 ? ' + bonus' : ''}`;
      button.setAttribute('aria-label', `Collect ${formatCoins(reward.amount)} coins from ${reward.title}`);
      button.title = `$${reward.dollars.toFixed(4)} at API prices, plus earned bonuses. $1 = 1 coin. Estimate, not a bill.`;
    }
    if (focused instanceof HTMLElement && !focused.isConnected && (focused.classList.contains('desk-coins') || focused.classList.contains('coin-reward-row'))) {
      (this.disclosure.open ? this.rows.values().next().value : document.getElementById('coin-bank'))?.focus({ preventScroll: true });
    }
  }
  collect(id: string, from: HTMLElement) {
    const origin = from.getBoundingClientRect();
    const coins = this.wallet.collect(id); // Synchronous consumption blocks double clicks.
    if (!coins) return;
    gameSound.play('collect');
    this.status.textContent = `Collected ${formatCoins(coins)} coins. Balance ${formatCoins(this.wallet.balance)}.`;
    this.fly(origin);
    this.world.deskFor(id)?.robot.react('cheer');
    this.syncHolds();
    this.render();
  }
  collectAll() {
    const rewards = this.wallet.rewards;
    const origin = this.collectAllButton.getBoundingClientRect();
    const coins = this.wallet.collectAll();
    if (!coins) return;
    gameSound.play('collect');
    this.status.textContent = `Collected ${formatCoins(coins)} coins from ${rewards.length} robots. Balance ${formatCoins(this.wallet.balance)}.`;
    for (const reward of rewards) this.world.deskFor(reward.id)?.robot.react('cheer');
    this.fly(origin);
    this.syncHolds(); this.render();
    document.getElementById('coin-bank')?.focus({ preventScroll: true });
  }
  private fly(from: DOMRect) {
    if (document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const bank = document.getElementById('coin-bank'); if (!bank) return;
    const to = bank.getBoundingClientRect();
    // Bound bursts even if several robots finish together.
    if (this.effects.size > 24) this.clearEffects();
    for (let i = 0; i < 7; i++) {
      const coin = document.createElement('span'); coin.className = 'coin-transfer'; coin.innerHTML = coinIcon(20);
      coin.setAttribute('aria-hidden', 'true');
      const x = from.left + from.width / 2 - 10, y = from.top + from.height / 2 - 10;
      coin.style.left = `${x}px`; coin.style.top = `${y}px`; document.body.append(coin);
      const timeline = gsap.timeline({ delay: i * .035, onComplete: () => { coin.remove(); this.effects.delete(coin); } })
        .to(coin, { x: (i - 3) * 13, y: -38 - Math.abs(i - 3) * 5, scale: 1.12, duration: .18, ease: 'power2.out' })
        .to(coin, { x: to.left + to.width / 2 - 10 - x, y: to.top + to.height / 2 - 10 - y, scale: .55, rotation: 270 + i * 40, duration: .46, ease: 'power2.in', opacity: .3 });
      this.effects.set(coin, timeline);
    }
  }
  private clearEffects() { for (const [el, animation] of this.effects) { animation.kill(); el.remove(); } this.effects.clear(); }
  destroy = () => {
    this.disposed = true; window.clearInterval(this.timer); this.clearEffects();
    document.removeEventListener('visibilitychange', this.visibility);
    window.removeEventListener('pagehide', this.destroy);
    for (const button of this.deskButtons.values()) { for (const animation of button.getAnimations({ subtree: true })) animation.cancel(); button.remove(); }
    this.deskButtons.clear(); this.rows.clear(); this.tray.remove(); this.status.remove();
  };
}
