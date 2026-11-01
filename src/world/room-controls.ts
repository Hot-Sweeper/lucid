import type gsap from 'gsap';
import './room-controls.css';

/** Keep a game's own animation clock intact while its physical display is off. */
export class MediaAnimations {
  private animations = new Set<gsap.core.Animation>();
  private held = new Set<gsap.core.Animation>();
  private paused = false;
  private dead = false;
  constructor() { document.addEventListener('visibilitychange', this.visibility); }
  private visibility = () => this.sync();
  private sync() {
    const hold = this.paused || document.hidden;
    for (const animation of this.animations) {
      if (hold && !animation.paused() && (animation.repeat() === -1 || animation.totalProgress() < 1)) { this.held.add(animation); animation.pause(); }
      else if (!hold && this.held.delete(animation)) animation.resume();
    }
  }
  add<A extends gsap.core.Animation>(animation: A): A {
    if (this.dead) { animation.kill(); return animation; }
    for (const old of this.animations) if (!old.isActive() && old.repeat() !== -1 && old.totalProgress() === 1) { this.animations.delete(old); this.held.delete(old); }
    this.animations.add(animation); this.sync(); return animation;
  }
  run(animation: gsap.core.Animation) { return new Promise<void>(resolve => { animation.eventCallback('onComplete', resolve); this.add(animation); }); }
  setPaused(paused: boolean) { this.paused = paused; this.sync(); }
  kill() { for (const animation of this.animations) animation.kill(); this.animations.clear(); this.held.clear(); }
  destroy() { this.dead = true; this.kill(); document.removeEventListener('visibilitychange', this.visibility); }
}

/** A semantic, whole-object hit area with a label that appears on interaction. */
export class RoomMediaControl {
  readonly el: HTMLButtonElement;
  constructor(parent: HTMLElement, key: string, bounds: { x: number; y: number; w: number; h: number }, action: () => void) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'room-media-control'; button.dataset.roomControl = key;
    button.style.cssText = `left:${bounds.x}px;top:${bounds.y}px;width:${bounds.w}px;height:${bounds.h}px`;
    button.innerHTML = '<span></span>';
    button.addEventListener('pointerdown', event => event.stopPropagation());
    button.addEventListener('dblclick', event => event.stopPropagation());
    button.addEventListener('click', event => { event.stopPropagation(); action(); });
    parent.appendChild(button); this.el = button;
  }
  state(label: string, pressed: boolean) {
    this.el.setAttribute('aria-label', label); this.el.setAttribute('aria-pressed', String(pressed));
    this.el.querySelector('span')!.textContent = label;
  }
  destroy() { this.el.remove(); }
}
