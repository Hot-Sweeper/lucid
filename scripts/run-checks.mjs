#!/usr/bin/env node
// Runs the deterministic checks in scripts/checks, one process each, and stops at the first failure.
//   node scripts/run-checks.mjs              every check
//   node scripts/run-checks.mjs soundtrack   only checks whose file name contains "soundtrack"
// Add a new check by appending its file name to CHECKS. Checks that open windows belong in scripts/review.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "scripts", "checks");

// verify-updater.cjs also runs verify-build-isolation, verify-update-command, verify-update-feedback
// and verify-frozen-input-native, so they are not listed separately.
export const CHECKS = [
  "verify-backend-stability.cjs",
  "verify-provider-limits.cjs",
  "verify-limit-pace.mjs",
  "verify-limit-view.mjs",
  "verify-botcoin.mjs",
  "verify-t3-theme.cjs",
  "verify-interface-tokens.mjs",
  "verify-favicons.cjs",
  "verify-game-sound.cjs",
  "verify-background-audio.cjs",
  "verify-soundtrack.cjs",
  "verify-soundscape.cjs",
  "verify-robot-voice.cjs",
  "verify-robot-lines.cjs",
  "verify-dictation.cjs",
  "verify-reports.cjs",
  "verify-headless-writer.cjs",
  "verify-settlement-recovery.cjs",
  "verify-report-scheduling.mjs",
  "verify-delegate-observation.mjs",
  "verify-orchestrator-recovery.mjs",
  "verify-orchestrator.cjs",
  "verify-orchestrator-panel.mjs",
  "verify-thread-actions.cjs",
  "verify-campus-atmosphere.mjs",
  "verify-campus-plan.mjs",
  "verify-landscape.mjs",
  "verify-landscape-retention.mjs",
  "verify-session-continuity.mjs",
  "verify-linux-launch.cjs",
  "verify-floor-plan.mjs",
  "verify-room-policy.mjs",
  "verify-snake-desks.mjs",
  "verify-office-drag.mjs",
  "verify-worker-match.mjs",
  "verify-harness-swap.mjs",
  "verify-chat-robot-marks.mjs",
  "verify-title-refresh.cjs",
  "verify-remote-media.cjs",
  "verify-coin-retention.cjs",
  "verify-world-refresh.mjs",
  "verify-desk-presence.mjs",
  "verify-chat-media.mjs",
  "verify-chat-review.mjs",
  "verify-monitor-tasks.mjs",
  "verify-background-jobs.cjs",
  "verify-thumbs.cjs",
  "verify-robot-canvas.mjs",
  "verify-run-status.cjs",
  "verify-tool-view.mjs",
  "verify-explorer-files.mjs",
  "verify-updater.cjs",
  "verify-screen-scheduler.mjs",
  "verify-screen-detail.mjs",
  "verify-screen-detail-controller.mjs",
  "verify-weather-retention.mjs",
  "verify-weather-default.mjs",
  "verify-outside-cull.mjs",
  "verify-outside-viewport.mjs",
  "verify-tile-clip-retention.mjs",
  "verify-raster-quiet.mjs",
  "verify-answer-artifacts.cjs",
  "verify-boot-renderer.mjs",
  "verify-building-footprint.mjs",
  "verify-charging.mjs",
  "verify-chat-history.cjs",
  "verify-chat-message.mjs",
  "verify-chat-scroll.mjs",
  "verify-chat-shelf.mjs",
  "verify-coin-controller.cjs",
  "verify-coins.cjs",
  "verify-coin-calendar.mjs",
  "verify-compaction-screen.mjs",
  "verify-connect.cjs",
  "verify-conversation-name.mjs",
  "verify-conversation-pages.cjs",
  "verify-deferred-robot.mjs",
  "verify-phone-leisure.mjs",
  "verify-delivery-attestation.cjs",
  "verify-desk-chat-targets.mjs",
  "verify-empty-desks.mjs",
  "verify-environments.cjs",
  "verify-exposed-scene.mjs",
  "verify-flavor-localization.cjs",
  "verify-floor-tiles.mjs",
  "verify-frontend-client.mjs",
  "verify-frontend-layout.mjs",
  "verify-studio.mjs",
  "verify-studio-server.cjs",
  "verify-game-text-layout.mjs",
  "verify-git-sync.cjs",
  "verify-highlighting.mjs",
  "verify-hire-runtime.cjs",
  "verify-history-items.cjs",
  "verify-history-window.mjs",
  "verify-image-refresh.mjs",
  "verify-image-results.mjs",
  "verify-layout-batching.mjs",
  "verify-lightweight.mjs",
  "verify-localization-canvas.mjs",
  "verify-localization.cjs",
  "verify-localization-client.mjs",
  "verify-localization-dom.cjs",
  "verify-localization-speech.mjs",
  "verify-work-skill.cjs",
  "verify-media-canvas.mjs",
  "verify-media-response.cjs",
  "verify-monitor-action-reuse.mjs",
  "verify-note-presentation.mjs",
  "verify-office-layout.mjs",
  "verify-office-width.mjs",
  "verify-orchestrator-controls.mjs",
  "verify-orchestrator-learning.cjs",
  "verify-park-toys.cjs",
  "verify-printer-layout.cjs",
  "verify-project-life.cjs",
  "verify-prompt-drafts.cjs",
  "verify-question-line-native.cjs",
  "verify-remote-polling.cjs",
  "verify-report-team.cjs",
  "verify-room-drag.mjs",
  "verify-room-fold.mjs",
  "verify-room-media.cjs",
  "verify-secret-input.cjs",
  "verify-shared-vectors.mjs",
  "verify-sheet-analysis.mjs",
  "verify-thread-list.mjs",
  "verify-thread-order.cjs",
  "verify-thread-state.mjs",
  "verify-touch-camera.mjs",
  "verify-uac-races.mjs",
  "verify-usage.cjs",
  "verify-watch-items.cjs",
  "verify-wheel-direction.mjs",
  "verify-window-occlusion.mjs",
  "verify-work-details.mjs",
  "verify-workspace-browser.cjs",
  "verify-workspace-browser.mjs",
  "verify-packaging.cjs",
];

const filters = process.argv.slice(2);
const selected = filters.length ? CHECKS.filter((name) => filters.some((f) => name.includes(f))) : CHECKS;
if (!selected.length) { console.error(`No check matches ${filters.join(", ")}.`); process.exit(1); }
const missing = CHECKS.filter((name) => !existsSync(join(dir, name)));
if (missing.length) { console.error(`Listed checks are missing: ${missing.join(", ")}`); process.exit(1); }

const started = Date.now();
for (const [index, name] of selected.entries()) {
  const begin = Date.now();
  const result = spawnSync(process.execPath, [join(dir, name)], { cwd: root, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const seconds = ((Date.now() - begin) / 1000).toFixed(1);
  if (result.status !== 0) {
    process.stdout.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    console.error(`\nFAIL ${name} (${seconds}s)${result.signal ? ` signal ${result.signal}` : ""}`);
    process.exit(result.status || 1);
  }
  console.log(`ok ${String(index + 1).padStart(3)}/${selected.length} ${name} (${seconds}s)`);
}
console.log(`\n${selected.length} checks passed in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
