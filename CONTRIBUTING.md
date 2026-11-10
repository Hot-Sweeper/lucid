# Contributing

Thanks for helping. Small, focused pull requests are easiest to review.

1. Install [T3 Code](https://t3.codes) and open it once, then Node.js 20 or newer.
2. `npm install`, then `npm run dev` to run the app with live reload.
3. Read [docs/architecture.md](docs/architecture.md), and [DESIGN.md](DESIGN.md) before changing
   anything visible. [AGENTS.md](AGENTS.md) lists the rules the project keeps (they apply to
   people too).
4. Add or update a check in `scripts/checks` for behavior you change, and list it in
   `scripts/run-checks.mjs`.
5. Run `npm run verify:update` before opening the pull request. It must pass.

Please keep the app honest: everything about real work comes from T3 Code, and only the robots'
leisure content is made up. Describe in the pull request what you checked by hand (screens,
sound, performance), and say so when something was not checked.

By contributing you agree that your contribution is licensed under the [MIT license](LICENSE).
Report security problems privately through GitHub's security advisories, not in public issues.
