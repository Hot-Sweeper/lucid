// Creates the office world with its utility rooms, the robot lines and project life.
import { ProjectLife } from "../office/project-life";
import { BreakRoom } from "../world/breakroom";
import { ChargingRoom } from "../world/charging";
import { QuestionLine } from "../world/queue";
import { World } from "../office/world";
import { setPersonaSource } from "../lines";
import { ThreadEventLines } from "../lines/thread-events";
import { api, $ } from "./dom";
import type { App } from "./context";

export function createOffice(app: App) {
  app.world = new World($("scene"), { peek: (u) => api.peek(u), image: (p) => api.image(p), readText: (p) => api.readText(p) });
  // Robot lines keep each robot's hobby, and seated robots remark on real T3 changes to their thread.
  setPersonaSource(name => app.world.roster.robots.find(r => r.name === name)?.prefs?.hobby);
  app.threadLines = new ThreadEventLines(app.world);
  app.projectLife = new ProjectLife(app.world);
  app.world.extFactory.break = (h, w, hh) => new BreakRoom(h, w, hh);
  app.world.extFactory.charging = (h, w, hh) => new ChargingRoom(h, w, hh);
  app.world.extFactory.queue = (h, w, hh) => new QuestionLine(h, w, hh);
  app.coinRewards = null;
  // Rewards in the tray are only collectible once their work may be collected (see collectible).
  app.coinReady = () => true;
  app.coinCollected = async () => {};
  (window as any).__world = app.world;
}
