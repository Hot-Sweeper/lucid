import { Cancelled } from "./wm";
import type { FunHost } from "../fun/host";

/** Share a cold load across desks, and never start a cancelled activity after it resolves. */
export function lazyActivity<T extends (body: HTMLElement, host: FunHost, opts: any) => Promise<any>>(load: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  const preload = () => pending ??= load().catch(error => { pending = undefined; throw error; });
  const run = (async (...args: Parameters<T>) => {
    if (args[1].stopped) throw new Cancelled();
    const activity = await preload();
    if (args[1].stopped) throw new Cancelled();
    return activity(args[0], args[1], args[2]);
  }) as T & { preload: () => Promise<T> };
  run.preload = preload;
  return run;
}
