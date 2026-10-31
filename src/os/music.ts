import gsap from "gsap";
import type { WM } from "./wm";

// "Botify", the robots' music app. Some robots put on a playlist when they start working or
// when they are bored: headphones on, head bobbing along. Songs and artists are made up.

type Track = { title: string; artist: string; len: string };
type Playlist = { name: string; by: string; bpm: number; colors: [string, string]; tracks: Track[] };

export const PLAYLISTS: Playlist[] = [
  { name: "Lo-fi Beats to Compile To", by: "Botify", bpm: 82, colors: ["#6a5acd", "#ff9fb2"], tracks: [
    { title: "Rainy Refactor", artist: "Chillhop Unit", len: "2:48" }, { title: "Coffee and Linters", artist: "Beatbot", len: "3:12" },
    { title: "Late Night Merge", artist: "Nujabyte", len: "2:57" }, { title: "Soft Reboot", artist: "lofi.exe", len: "3:31" }, { title: "Cache Me Outside", artist: "Snoozy Servo", len: "2:22" } ] },
  { name: "Synthwave Overclock", by: "Botify", bpm: 112, colors: ["#ff4fa3", "#2b1a6a"], tracks: [
    { title: "Neon Kernel", artist: "Daftbyte", len: "4:05" }, { title: "Outrun the Garbage Collector", artist: "Turbo Thread", len: "3:44" },
    { title: "Midnight Deploy", artist: "The Night Shift", len: "4:21" }, { title: "Chrome Horizon", artist: "Perturbot", len: "3:58" } ] },
  { name: "Deep Focus", by: "Botify", bpm: 70, colors: ["#1f6f78", "#9be3c9"], tracks: [
    { title: "Gradient Descent", artist: "Ambient Array", len: "5:12" }, { title: "Quiet Tokens", artist: "Stillness", len: "4:40" },
    { title: "Flow State", artist: "Low Latency", len: "6:03" }, { title: "Tabs Not Spaces", artist: "Monospace", len: "4:18" } ] },
  { name: "Robot Rock", by: "Botify", bpm: 128, colors: ["#e8483a", "#2a2a2e"], tracks: [
    { title: "Stack Overflowin'", artist: "Iron Byte", len: "3:33" }, { title: "Kill Dash Nine", artist: "The Processes", len: "2:59" },
    { title: "Highway to the Cloud", artist: "AC/DCompute", len: "3:27" }, { title: "Segfault Blues", artist: "Muddy Pointers", len: "4:02" } ] },
  { name: "Hype Mode", by: "Botify", bpm: 140, colors: ["#ffd27a", "#ff6f3c"], tracks: [
    { title: "Ship It (Remix)", artist: "DJ Deploy", len: "2:41" }, { title: "Green Checks", artist: "Lil Test", len: "2:18" },
    { title: "Zero Downtime", artist: "MC Uptime", len: "3:05" }, { title: "Ten Times Engineer", artist: "Big Compute", len: "2:52" } ] },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const cover = (p: Playlist, size: number) => `<div class="bf-cover" style="width:${size}px;height:${size}px;background:linear-gradient(135deg, ${p.colors[0]}, ${p.colors[1]})"><svg viewBox="0 0 40 40" width="${size * 0.5}" height="${size * 0.5}" aria-hidden="true"><rect x="9" y="11" width="22" height="19" rx="7" fill="#fff" opacity="0.9"/><circle cx="16" cy="20" r="2.6" fill="${p.colors[1]}"/><circle cx="24" cy="20" r="2.6" fill="${p.colors[1]}"/><rect x="19" y="4" width="2" height="7" rx="1" fill="#fff" opacity="0.9"/><circle cx="20" cy="4" r="2.4" fill="#fff"/></svg></div>`;

export class MusicApp {
  playing: Playlist | null = null;
  private trackIx = 0;
  private timer = 0;
  private progress: gsap.core.Tween | null = null;

  constructor(private wm: WM) {}

  private async ensure() {
    const w = await this.wm.open("music");
    if (!w.body.querySelector(".botify")) {
      w.body.innerHTML = `<div class="botify">
        <aside class="bf-side"><b class="bf-logo"><i></i>Botify</b><span>Home</span><span>Search</span><span class="bf-lib">Your Library</span>
          ${PLAYLISTS.map((p, i) => `<button type="button" tabindex="-1" class="bf-pl" data-p="${i}">${cover(p, 22)}<span>${esc(p.name)}</span></button>`).join("")}</aside>
        <main class="bf-main"></main>
        <footer class="bf-bar"><div class="bf-now"></div><div class="bf-ctrl"><span class="bf-btn">⏮</span><span class="bf-play">▶</span><span class="bf-btn">⏭</span><div class="bf-prog"><i></i></div></div><div class="bf-eq"><i></i><i></i><i></i><i></i></div></footer>
      </div>`;
    }
    return w.body.querySelector(".botify") as HTMLElement;
  }

  private showList(b: HTMLElement, p: Playlist) {
    (b.querySelector(".bf-main") as HTMLElement).innerHTML = `
      <header class="bf-head" style="background:linear-gradient(180deg, ${p.colors[0]}cc, transparent)">${cover(p, 78)}<div><small>Playlist</small><h3>${esc(p.name)}</h3><span>${esc(p.by)}, ${p.tracks.length} songs</span></div></header>
      <ol class="bf-tracks">${p.tracks.map((t, i) => `<li data-t="${i}"><span class="n">${i + 1}</span><span class="t"><b>${esc(t.title)}</b><i>${esc(t.artist)}</i></span><span class="l">${t.len}</span></li>`).join("")}</ol>`;
  }

  private showNow(b: HTMLElement) {
    const p = this.playing!, t = p.tracks[this.trackIx % p.tracks.length];
    (b.querySelector(".bf-now") as HTMLElement).innerHTML = `${cover(p, 30)}<div><b>${esc(t.title)}</b><i>${esc(t.artist)}</i></div>`;
    b.querySelectorAll(".bf-tracks li").forEach((li, i) => li.classList.toggle("on", i === this.trackIx % p.tracks.length));
    (b.querySelector(".bf-play") as HTMLElement).textContent = "⏸";
    b.classList.add("is-playing");
    b.style.setProperty("--beat", `${(60 / p.bpm).toFixed(3)}s`);
    this.progress?.kill();
    this.progress = gsap.fromTo(b.querySelector(".bf-prog i"), { width: "0%" }, { width: "100%", duration: 70, ease: "none" });
  }

  // Pick a playlist (or the given one), press play. Returns the tempo for head bobbing.
  async start(prefer?: number) {
    const wm = this.wm, e = wm.epoch;
    const b = await this.ensure();
    const ix = prefer ?? Math.floor(Math.random() * PLAYLISTS.length);
    const p = PLAYLISTS[ix];
    const item = b.querySelector(`[data-p="${ix}"]`) as HTMLElement;
    await wm.pointAt(item, 0.5, 0.5, 380);
    await wm.click();
    wm.check(e);
    this.showList(b, p);
    gsap.fromTo(b.querySelector(".bf-main"), { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 0.3 });
    await wm.sleep(500, e);
    this.trackIx = Math.floor(Math.random() * p.tracks.length);
    const row = b.querySelector(`[data-t="${this.trackIx}"]`) as HTMLElement;
    await wm.pointAt(row, 0.3, 0.5, 340);
    await wm.click(true);
    this.playing = p;
    this.showNow(b);
    window.clearInterval(this.timer);
    // a new song every so often, as long as the window is around
    this.timer = window.setInterval(() => {
      const w = this.wm.wins.get("music");
      if (!w || !this.playing) return;
      this.trackIx++;
      this.showNow(w.body.querySelector(".botify") as HTMLElement);
    }, 70000);
    await wm.sleep(400, e);
    return p.bpm;
  }

  stop() {
    this.playing = null;
    window.clearInterval(this.timer);
    this.progress?.kill();
    const b = this.wm.wins.get("music")?.body.querySelector(".botify") as HTMLElement | null;
    if (b) { b.classList.remove("is-playing"); (b.querySelector(".bf-play") as HTMLElement).textContent = "▶"; }
  }
}
