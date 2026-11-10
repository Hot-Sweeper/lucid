# Token Industries

A living office for your [T3 Code](https://t3.codes) agents.

Each T3 Code project is an office. Each thread is a robot at its own desk, and the robot's computer
shows its real work: the folders it browses, the files it reads, the code it types, the commands
it runs and the pages it opens. You hire robots for new tasks, chat with them, answer their
questions and collect finished work, all from inside the office. When they are not busy, the
robots take breaks, play and chat in the shared rooms.

Everything real comes from T3 Code. The office never invents progress, questions or results; only
the robots' leisure apps and games are made up.

## Requirements

- [T3 Code](https://t3.codes), installed and opened at least once. The office reads T3's data
  folder (`~/.t3`, or `T3CODE_HOME` if you set it) and acts through T3's own server and CLI.
- Linux, Windows or macOS.

## Install

Download the latest version from the [Releases page](../../releases/latest):

| System | File |
| --- | --- |
| Linux | `.AppImage` (any distribution), `.deb` (Debian, Ubuntu) or `.rpm` (Fedora, openSUSE) |
| Windows | `.exe` installer |
| macOS | `.dmg` (Apple silicon and Intel) |

Installed versions update themselves from the Releases page when you click **Update** (on macOS,
Update opens the download page).

**macOS, first launch only.** The app is free and not notarized by Apple, so macOS blocks it the
first time. Open it once, then go to **System Settings > Privacy & Security** and click
**Open Anyway** next to the message about the app. It opens normally after that.

**Windows.** Until releases are signed, SmartScreen may warn about an unknown publisher. Click
**More info**, then **Run anyway**.

### From source

You need [Node.js](https://nodejs.org) 20 or newer and Git.

```sh
git clone <this repository's URL>
cd <the cloned folder>
npm install
npm start
```

The first start builds the app. A source checkout updates through the Update button too: it pulls
fast-forward changes, checks and rebuilds them, and only then replaces the running version.

## Privacy

Your work stays on your computer. There is no account, no telemetry and no analytics. The app
reads T3 Code's data read-only and acts only through T3 Code's own server on this computer, or on
computers you linked in T3 Connect. Dictation audio goes only to T3 Code's local speech service
and is not saved.

A few features fetch public data. These requests carry no account or tracking id, but like any
web request they reveal your IP address to the service:

- Weather in the windows: your approximate location from an IP lookup (ipwho.is, ipapi.co), then
  the forecast from Open-Meteo.
- The robots' trading game: Bitcoin prices from Binance and CoinGecko.
- The robots' browser: pages and icons from the sites your agents visited, public GitHub, Hugging
  Face and Wikipedia pages, and DuckDuckGo results for an agent's web search when T3 did not record
  them (the agent's search words are sent to DuckDuckGo).
- Update checks: GitHub Releases (installed versions) or your git remote (source checkouts).

Flavor text and translations are written by a harness CLI you already use (such as Claude Code or
Codex), under your own account with that provider.

## Development

```sh
npm run dev               # Vite dev server and Electron, with live reload of the interface
npm test                  # all fast checks (scripts/checks)
npm run typecheck
npm run verify:update     # typecheck, every check and a production build: run before handing back
npm run package           # installers for this computer, in release/
npm run dev:playgrounds   # isolated pages for single parts of the office (dev/)
```

Builds go to `dist-build`; only the coordinated updater replaces `dist`. Start with
[docs/architecture.md](docs/architecture.md), [DESIGN.md](DESIGN.md) for the visual language and
[CONTRIBUTING.md](CONTRIBUTING.md). Releases are described in [docs/releasing.md](docs/releasing.md).

## License

The code, artwork and music are [MIT licensed](LICENSE). Forks need their own name, logo and
mascot: see [TRADEMARKS.md](TRADEMARKS.md). Third-party fonts, libraries and credits are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
