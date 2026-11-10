// The wallet and coin rewards: the balance in the sidebar, collecting coins and the coin ledger.
import { CoinRewards } from "../office/coin-rewards";
import { formatCoins } from "../office/coin-ledger";
import { gameSound } from "../office/sound";
import { OfficeSoundscape } from "../office/soundscape";
import gsap from "gsap";
import { CoinLedgerPanel } from "../stats/ledger-panel";
import { Wallet } from "../office/wallet";
import { api, $ } from "./dom";
import type { App } from "./context";

export function mountWallet(app: App) {
  // Coins show what the robots' API-priced work cost; they wait on each desk until collected.
  app.wallet = new Wallet(() => app.settings.wallet, (s) => { app.settings.wallet = s; app.saveSettings(); });
}

export function mountCoins(app: App) {
  app.bankAmount = app.wallet.balance;
  app.paintWallet = (gained = 0) => {
    const b = $("wl-bal");
    b.textContent = formatCoins(app.wallet.balance);
    const bank = $('coin-bank-bal'), target = { value: app.bankAmount };
    gsap.killTweensOf(bank);
    const bankAnimation = (bank as any).__count as gsap.core.Tween | undefined; bankAnimation?.kill();
    if (gained > 0 && !document.hidden && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Count up while the collected coins land on the counter (coin-rewards.ts fly).
      (bank as any).__count = gsap.to(target, { value: app.wallet.balance, delay: .5, duration: .7, ease: 'power1.inOut', onUpdate: () => { bank.textContent = formatCoins(target.value); app.bankAmount = target.value; } });
    } else { app.bankAmount = app.wallet.balance; bank.textContent = formatCoins(app.bankAmount); }
    $('coin-bank').title = `${formatCoins(app.wallet.balance)} coins from collected work. Open the coin ledger`;
    const rb = $("rail-bal"), n = app.wallet.balance;
    rb.textContent = n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : formatCoins(n);
    $("rail-coins").title = `${n.toLocaleString()} coins from collected work. Open the coin ledger`;
    if (gained > 0 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const f = document.createElement("span");
      f.className = "wl-gain";
      f.textContent = `+${gained.toLocaleString()}`;
      $("wallet").appendChild(f);
      gsap.fromTo(f, { y: 0, opacity: 1 }, { y: -22, opacity: 0, duration: 1.4, ease: "power2.out", onComplete: () => f.remove() });
      gsap.fromTo(".wl-coins .coin-ico", { rotateY: 0 }, { rotateY: 360, duration: 0.6, ease: "power2.out" });
    }
  };
  app.wallet.onChange = (_bal, gained) => app.paintWallet(gained);
  app.paintWallet();
  app.coinRewards = new CoinRewards(app.wallet, app.world, () => (api as any).coinUsage(), { ready: id => app.coinReady(id), collected: id => app.coinCollected(id).then(() => app.refresh()) });
  (window as any).__coinRewards = app.coinRewards;
  // The coin ledger opens from every coin counter; the wallet sits in Office & settings, which closes first.
  app.coinLedger = new CoinLedgerPanel({
    load: () => (api as any).coinCalendar(), refresh: () => app.coinRewards!.refresh(), wallet: app.wallet,
    robotOf: id => { const r = app.world.roster.forJob(id); return r ? { id: r.id, name: r.name, provider: r.provider, look: r.look } : null; },
  });
  app.coinRewards.onRead = snapshot => app.coinLedger.observe(snapshot.calendarRev);
  for (const id of ["rail-coins", "coin-bank"]) $(id).addEventListener("click", () => app.coinLedger.toggle($(id)));
  $("wl-coins").addEventListener("click", () => { document.querySelector<HTMLElement>(".office-settings .os-close")?.click(); app.coinLedger.show($("side-settings")); });
  (window as any).__wallet = app.wallet;
  (window as any).__gameSound = gameSound;
  app.soundscape = new OfficeSoundscape(app.world);
  (window as any).__soundscape = app.soundscape;
}
