// The renderer bridge's type (electron/preload.cjs exposes it as window.lucid).
import type { WorldData } from "../office/world";
import type { ThreadInfo } from "../director";

declare global {
  interface Window {
    lucid: {
      projects(): Promise<{ id: string; title: string; root: string }[]>;
      world(): Promise<WorldData>;
      startThreadIn?: never;
      settingsLoad(): string;
      settingsSave(json: string): Promise<void>;
      addProject(o: { path: string; title?: string }): Promise<{ output: string }>;
      removeProject(o: { id: string }): Promise<{ output: string }>;
      host(): Promise<string>;
      orchInit(o?: { provider?: string; model?: string }): Promise<{ threadId: string; projectId: string; dir: string }>;
      orchMemory(): Promise<string>;
      userMessagesSince(since: string, exclude: string): Promise<{ threadId: string; title: string; at: string; text: string }[]>;
      conversation(id: string): Promise<any[]>;
      attachDir(): Promise<string>;
      watchSet(ids: string[]): Promise<boolean>;
      startThread(o: { project: string; message: string; provider?: string; model?: string; options?: Record<string, string | boolean>; requestId?: string }): Promise<{ threadId: string }>;
      sendMessage(o: { threadId: string; message: string }): Promise<{ ok: boolean }>;
      peek(url: string): Promise<any>;
      image(path: string): Promise<string | null>;
      readText(path: string): Promise<string | null>;
      onItems(fn: (p: { threadId: string; items: any[]; initial: boolean }) => void): () => void;
      onInfo(fn: (p: { threadId: string; info: ThreadInfo }) => void): () => void;
      checkUpdate(): Promise<{ available: boolean; behind?: number; local?: number; legacy?: boolean; changes?: string[]; files?: string[]; reason?: string }>;
      applyUpdate(): Promise<{ ok: boolean; error?: string; kind?: string; details?: string }>;
      onUpdateStep(fn: (s: string) => void): () => void;
      version(): Promise<string>;
    };
  }
}
export {};
