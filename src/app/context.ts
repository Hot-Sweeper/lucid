// The app context: everything the renderer's modules share (the world, chat, settings, the
// orchestrator...) and the functions they call on each other. main.ts creates it and passes it to
// every module, so modules never import each other's state.
import type { api } from "./dom";
import type { ProjectLife } from "../office/project-life";
import type { CoinRewards } from "../office/coin-rewards";
import type { OfficeSoundscape } from "../office/soundscape";
import type { DailyWriter, DailyLinesState } from "../office/daily-writer";
import type { RoomTheme } from "../office/decorate";
import type { World, WorldData } from "../office/world";
import type { ChatPanel } from "../office/chat-panel";
import type { AnswerCard } from "../office/answer";
import type { MonitorTasks, Collectible, WorkDetails } from "../office/monitor-tasks";
import type { Delegate } from "../office/delegate";
import type { Role } from "../office/hire";
import type { RobotProfile } from "../robot";
import type { Orchestrator, OrchState } from "../office/orchestrator";
import type { CoinLedgerPanel } from "../stats/ledger-panel";
import type { Wallet, WalletState } from "../office/wallet";
import type { ThreadEventLines } from "../lines/thread-events";
import type { Desk } from "../office/desk";
import type { ThreadInfo } from "../director";
import type { ThreadRef } from "../office/thread-ref";
import type { EdgePeek } from "../office/edge-peek";



export interface App {
  dailyWriter: DailyWriter | null;
  extras: HTMLDivElement;
  extrasBody: HTMLElement;
  world: World;
  threadLines: ThreadEventLines;
  projectLife: ProjectLife;
  coinRewards: CoinRewards | null;
  coinReady: (id: string) => boolean;
  coinCollected: (id: string) => Promise<void>;
  chat: ChatPanel;
  answerDeps: {
    pending: (threadId: string) => Promise<import("../office/answer").PendingRequest[]>;
    t3: any;
    advice: (rid: string) => import("../office/delegate").Advice | null;
};
  answer: AnswerCard;
  monitorTasks: MonitorTasks;
  collectible(id: string, _fresh: boolean): Collectible | null;
  workDetails(id: string): Promise<WorkDetails>;
  settledNow: () => Set<string>;
  openWorkerProfile(r: RobotProfile, anchor: Element | null): void;
  openWall(): void;
  collectingWork: Set<string>;
  collectWork(id: string, from: HTMLElement): Promise<void>;
  keepDesk(id: string): void;
  removeKeptDesk(id: string): void;
  settleInT3(id: string): Promise<void>;
  operationalStatus(t: WorldData["threads"][number]): import("../office/thread-state").ThreadState;
  paintSelectedStatus(): void;
  pushStatus(d: Desk): void;
  origError: (...data: any[]) => void;
  sceneObserver: MutationObserver;
  watched: string;
  watchBusy: boolean;
  desiredWatches(): string[];
  syncWatches(): Promise<void>;
  firstLoad: boolean;
  refreshBusy: boolean;
  buildingEpoch: number;
  switchingBuilding: boolean;
  currentEnvironment: string | undefined;
  buildingCameras: Map<string, {
    x: number;
    y: number;
    s: number;
}>;
  refresh(): Promise<void>;
  startNewTask: () => void;
  setupMenus(): void;
  updateState: Awaited<ReturnType<typeof api.checkUpdate>> | null;
  updateChecking: boolean;
  updateCheckError: string;
  lastUpdateFailure: {
    message: string;
    details: string;
    kind?: string;
} | null;
  updateTimeout<T>(operation: Promise<T>, milliseconds: number): Promise<T>;
  checkUpdate(): Promise<void>;
  attachDir: string;
  selectBuilding(id: string): Promise<void>;
  settings: {
    buildingLayouts?: Record<string, import("../office/world").OfficeLayout>;
    roomOrder?: string[];
    expandedRooms?: string[];
    collapsedRooms?: string[];
    seats?: Record<string, (string | null)[]>;
    hidden?: string[];
    extra?: Record<string, number>;
    homes?: Record<string, string>;
    orch?: OrchState | null;
    dailyLines?: DailyLinesState;
    roles?: Role[];
    themes?: Record<string, RoomTheme>;
    wallet?: WalletState;
    keptDesks?: string[];
    weatherFix?: {
        kind: string;
        at: number;
    };
    ui?: {
        rail?: boolean;
        chatTab?: boolean;
        folded?: string[];
        sideW?: number;
        chatW?: number;
        sideAuto?: boolean;
        chatAuto?: boolean;
    };
};
  ui: {
    rail?: boolean;
    chatTab?: boolean;
    folded?: string[];
    sideW?: number;
    chatW?: number;
    sideAuto?: boolean;
    chatAuto?: boolean;
};
  folded: Set<string>;
  appEl: HTMLElement;
  widths: () => {
    side: number;
    chat: number;
};
  applyLayout: () => void;
  slideChat: (animate: boolean) => void;
  makeGrip: (cls: "left" | "right", label: string, key: "sideW" | "chatW", range: {
    min: number;
    max: number;
}, def: () => number) => HTMLDivElement;
  sideGrip: HTMLDivElement;
  chatGrip: HTMLDivElement;
  sidePanel: HTMLElement;
  sideOpenWidth: () => number;
  sidePeek: EdgePeek;
  paintSidePin: () => void;
  setSideAuto: (on: boolean) => void;
  toggleRail: (on: boolean, animate?: boolean) => void;
  foldRail: (on: boolean, animate?: boolean) => void;
  saveSettings: () => Promise<void>;
  renderHidden(): void;
  projectTitles: Map<string, string>;
  orch: Orchestrator;
  delegate: Delegate;
  renderOrch(): void;
  openSetup(): void;
  openControls(): void;
  inChair: boolean;
  takeChair(): void;
  wallet: Wallet;
  soundButton: HTMLElement;
  terribleSongButton: HTMLButtonElement;
  paintTerribleSong: () => void;
  paintSound: () => void;
  volumeControl: HTMLLabelElement;
  volumeSlider: HTMLInputElement;
  bankAmount: number;
  paintWallet: (gained?: number) => void;
  coinLedger: CoinLedgerPanel;
  soundscape: OfficeSoundscape;
  liveWeather: any;
  WX_FIX_MS: number;
  weatherFix(): string | null;
  showWeather(): void;
  weatherMenu(): void;
  pollWeather(): Promise<void>;
  openDetachedChat(id: string, info?: ThreadInfo): void;
  needsAnswer: (id: string) => boolean;
  openAnswer(id: string): void;
  ago: (iso?: string | null) => string;
  thSig: string;
  threadMovePending: boolean;
  moveThread(id: string, targetId: string, after: boolean): Promise<void>;
  threadNeighbors(id: string): {
    previous: import("../office/world").WThread;
    next: import("../office/world").WThread;
};
  listDeferred: boolean;
  searchState: {
    q: string;
    matches: Map<string, {
        snippet: string;
        quality: number | null;
    }>;
    older: {
        id: string;
        title: string;
        projectId: string | null;
        updatedAt: string;
        provider: string;
        settled: boolean;
    }[];
};
  runThreadSearch(q: string): void;
  renderThreads(force?: boolean): void;
  listRows: () => HTMLElement[];
  findThread(): void;
  nextNeedingYou(): void;
  newProject(): void;
  markSelected(id: string | null): void;
  openThread(id: string): void;
  railSig: string;
  renderRail(): void;
  threadRef(id: string): ThreadRef | null;
  referenceInChat(id: string, x: number, y: number): void;
  pinItems(id: string): {
    label: string;
    run: () => Promise<void>;
}[];
  threadActionItems(id: string): any[];
  officeMoveItems(id: string): {
    label: string;
    run: () => void;
}[];
  threadMenu(row: HTMLElement, x: number, y: number): void;
}
