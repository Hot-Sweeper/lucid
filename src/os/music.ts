import gsap from "gsap";
import type { WM } from "./wm";
import { ICONS } from "./icons";

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
const secs = (len: string) => { const [m, s] = len.split(":").map(Number); return m * 60 + s; };
const clock = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;

// Player icons, drawn like the real thing (16 unit grid, filled).
const svg = (d: string) => `<svg class="bf-i" viewBox="0 0 16 16" aria-hidden="true"><path d="${d}" fill="currentColor" fill-rule="evenodd"/></svg>`;
const I = {
  home: svg("M8 1.2 1.5 6.4V15h4.6v-4.6h3.8V15h4.6V6.4Z"),
  search: svg("M7 1.5a5.5 5.5 0 0 1 4.4 8.8l3.4 3.4-1.1 1.1-3.4-3.4A5.5 5.5 0 1 1 7 1.5Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"),
  shuffle: svg("M11.6 1.6 14.4 4l-2.8 2.4V4.8h-1.3L5.2 11.6H1.5v-1.5h2.9l5.1-6.8h2.1Zm0 8 2.8 2.4-2.8 2.4v-1.6H9.5L8 10.8l.9-1.2 1.4 1.9h1.3ZM1.5 4.4h3.7L6.8 6.5l-.9 1.2L4.4 5.9H1.5Z"),
  prev: svg("M3.3 2h1.6v12H3.3Zm10.4.6v10.8L6.1 8Z"),
  next: svg("M11.1 2h1.6v12h-1.6ZM2.3 2.6v10.8L9.9 8Z"),
  play: svg("M4.5 2.4v11.2L13.6 8Z"),
  pause: svg("M4 2.4h2.9v11.2H4Zm5.1 0H12v11.2H9.1Z"),
  repeat: svg("M4.6 3h6.9A3.5 3.5 0 0 1 15 6.5v1.6h-1.5V6.5a2 2 0 0 0-2-2H4.6v1.6L2.1 3.8 4.6 1.5Zm6.8 10H4.5A3.5 3.5 0 0 1 1 9.5V7.9h1.5v1.6a2 2 0 0 0 2 2h6.9V9.9l2.5 2.3-2.5 2.3Z"),
  queue: svg("M1.5 2.5h13V4h-13Zm0 4h13V8h-13Zm0 4h6V12h-6Zm8.5-.6v4.4l3.6-2.2Z"),
  device: svg("M4.3 1h7.4c.7 0 1.3.6 1.3 1.3v11.4c0 .7-.6 1.3-1.3 1.3H4.3c-.7 0-1.3-.6-1.3-1.3V2.3C3 1.6 3.6 1 4.3 1Zm.2 1.5v11h7v-11ZM8 6.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8Zm0 1.4a1 1 0 1 0 0 2 1 1 0 0 0 0-2ZM8 3.3a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"),
  volume: svg("M1.5 5.6h2.9L8.6 2v12L4.4 10.4H1.5Zm9.1-.9a4.4 4.4 0 0 1 0 6.6l-1-1.1a2.9 2.9 0 0 0 0-4.4Zm1.9-2.1a7.3 7.3 0 0 1 0 10.8l-1-1.1a5.8 5.8 0 0 0 0-8.6Z"),
  clock: svg("M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13ZM8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3Zm-.75 1.6h1.5v3.1l2.1 1.2-.75 1.3-2.85-1.6Z"),
  // added to Liked Songs: a green disc with a dark check
  added: `<svg class="bf-i bf-added" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="#1ed760"/><path d="m4.7 8.2 2.2 2.2 4.4-4.6" stroke="#000" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};
const EQ = `<span class="bf-eqb" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;

export class MusicApp {
  playing: Playlist | null = null;
  private shown: Playlist | null = null;
  private current: Playlist | null = null;   // stays set while paused
  private trackIx = 0;
  private elapsed = 0;
  private timer = 0;

  constructor(private wm: WM) {}

  private get body() { return (this.wm.wins.get("music")?.body.querySelector(".botify") as HTMLElement | null) ?? null; }

  private async ensure() {
    const w = await this.wm.open("music");
    if (!w.body.querySelector(".botify")) {
      w.body.innerHTML = `<div class="botify">
        <aside class="bf-side">
          <nav class="bf-nav"><b class="bf-logo">${ICONS.music}<span>Botify</span></b><span>${I.home}Home</span><span>${I.search}Search</span></nav>
          <div class="bf-libbox"><span class="bf-lib">Your Library</span>
          ${PLAYLISTS.map((p, i) => `<button type="button" tabindex="-1" class="bf-pl" data-p="${i}">${cover(p, 26)}<span><b>${esc(p.name)}</b><i>Playlist, ${esc(p.by)}</i></span></button>`).join("")}</div></aside>
        <main class="bf-main"></main>
        <footer class="bf-bar">
          <div class="bf-now"></div>
          <div class="bf-ctrl"><div class="bf-btns"><span class="bf-btn on">${I.shuffle}</span><span class="bf-btn">${I.prev}</span><span class="bf-play">${I.play}${I.pause}</span><span class="bf-btn">${I.next}</span><span class="bf-btn">${I.repeat}</span></div>
            <div class="bf-time"><span class="bf-el">0:00</span><div class="bf-prog"><i></i></div><span class="bf-len">0:00</span></div></div>
          <div class="bf-right"><span class="bf-btn">${I.queue}</span><span class="bf-btn">${I.device}</span><span class="bf-btn">${I.volume}</span><div class="bf-vol"><i></i></div></div>
        </footer>
      </div>`;
    }
    return w.body.querySelector(".botify") as HTMLElement;
  }

  private showList(b: HTMLElement, p: Playlist) {
    this.shown = p;
    const total = Math.round(p.tracks.reduce((n, t) => n + secs(t.len), 0) / 60);
    (b.querySelector(".bf-main") as HTMLElement).innerHTML = `
      <header class="bf-head" style="background:linear-gradient(180deg, ${p.colors[0]}, ${p.colors[0]}66)">${cover(p, 84)}<div><small>Playlist</small><h3>${esc(p.name)}</h3><span><b>${esc(p.by)}</b> · ${p.tracks.length} songs, ${total} min</span></div></header>
      <div class="bf-list" style="background:linear-gradient(180deg, ${p.colors[0]}40, transparent 90px)">
        <div class="bf-actions"><span class="bf-big">${I.play}${I.pause}</span><span class="bf-btn">${I.shuffle}</span></div>
        <div class="bf-cols"><span>#</span><span>Title</span><span>${I.clock}</span></div>
        <ol class="bf-tracks">${p.tracks.map((t, i) => `<li data-t="${i}"><span class="n"><span class="num">${i + 1}</span>${EQ}</span><span class="t"><b>${esc(t.title)}</b><i>${esc(t.artist)}</i></span><span class="l">${t.len}</span></li>`).join("")}</ol>
      </div>`;
    this.paintState(b);
  }

  private track() { const p = this.playing!; return p.tracks[this.trackIx % p.tracks.length]; }

  // Now playing, bottom left: cover of what plays, title, artist, and the green "added" check.
  private showNow(b: HTMLElement) {
    const p = this.playing!, t = this.track();
    (b.querySelector(".bf-now") as HTMLElement).innerHTML = `${cover(p, 38)}<div><b>${esc(t.title)}</b><i>${esc(t.artist)}</i></div>${I.added}`;
    (b.querySelector(".bf-len") as HTMLElement).textContent = t.len;
    b.style.setProperty("--beat", `${(60 / p.bpm).toFixed(3)}s`);
    this.paintState(b);
    this.paintTime(b, false);
  }

  // Playing or paused: the play buttons, and the current row in green with moving bars
  // (or its number again while paused).
  private paintState(b: HTMLElement) {
    b.classList.toggle("is-playing", !!this.playing);
    const mine = !!this.current && this.shown === this.current;
    b.querySelector(".bf-big")?.classList.toggle("is-on", mine && !!this.playing);
    const cur = this.current ? this.trackIx % this.current.tracks.length : -1;
    b.querySelectorAll(".bf-tracks li").forEach((li, i) => li.classList.toggle("on", mine && i === cur));
    // the playing row is always in view (scrolled by hand: scrollIntoView would move the whole desk)
    const row = b.querySelector(".bf-tracks li.on") as HTMLElement | null, main = b.querySelector(".bf-main") as HTMLElement;
    if (row && row.offsetTop + row.offsetHeight > main.scrollTop + main.clientHeight) main.scrollTop = row.offsetTop + row.offsetHeight - main.clientHeight + 8;
  }

  private paintTime(b: HTMLElement, smooth = true) {
    if (!this.playing) return;
    const len = secs(this.track().len);
    (b.querySelector(".bf-el") as HTMLElement).textContent = clock(this.elapsed);
    const bar = b.querySelector(".bf-prog i") as HTMLElement;
    bar.style.transition = smooth ? "" : "none";
    bar.style.transform = `scaleX(${Math.min(1, this.elapsed / len).toFixed(4)})`;
  }

  // The clock runs while something plays; at the end of a song the next one starts.
  private run() {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      const b = this.body;
      if (!this.playing || !b) return;
      this.elapsed++;
      if (this.elapsed >= secs(this.track().len)) { this.trackIx++; this.elapsed = 0; this.showNow(b); }
      else this.paintTime(b);
    }, 1000);
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
    this.playing = this.current = p;
    this.elapsed = 0;
    this.showNow(b);
    this.run();
    await wm.sleep(400, e);
    return p.bpm;
  }

  // Paused: the bars stop, the row shows its number again, the clock stands still.
  stop() {
    this.playing = null;
    window.clearInterval(this.timer);
    const b = this.body;
    if (b) this.paintState(b);
  }
}
