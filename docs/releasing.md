# Releasing

Releases are free to make: no paid developer accounts, no signing certificates you buy.

## What gets built

`electron-builder.config.cjs` takes the product name, app id and executable name from
`electron/brand.cjs`. It packages `electron/` (main process and the skill text it hands to jobs)
and the Vite build (`dist-build`, packaged as `dist/`, with fonts, art and music inside). Nothing
in an installed build reads a git checkout.

| Platform | Artifacts | Signing |
| --- | --- | --- |
| Linux | AppImage, deb, rpm (x64) | none needed |
| Windows | NSIS installer (x64 and arm64) | unsigned by default, free SignPath signing below |
| macOS | universal DMG (Apple silicon and Intel) | ad-hoc, no Apple account |

Templates for other Linux channels live in `packaging/flatpak` and `packaging/aur`. Read the
status note at the top of the Flatpak manifest before submitting it anywhere.

## Making a release

1. Set `version` in `package.json`, commit, and push.
2. Tag that commit `v<version>` and push the tag.
3. `.github/workflows/release.yml` runs typecheck and every check, then builds on Linux, Windows
   and macOS and uploads the installers and update metadata (`latest.yml`, `latest-linux.yml`)
   to a **draft** GitHub Release.
4. Read the draft, write release notes, and publish it. Installed apps see the update only after
   the release is published.

Build locally for your own platform with `npm run package` (output in `release/`, which is
ignored by git).

## Updates in installed builds

`electron/packaged-updater.cjs` runs when `app.isPackaged`. The update button keeps working the
same way:

- Windows, AppImage, deb and rpm download the new release through electron-updater after the user
  clicks Update, save the office, then install and restart.
- macOS opens the release page instead. Replacing an app in place needs a Developer ID signature,
  which the free ad-hoc signature is not.
- Flatpak, AUR and other package managers own their files; the app leaves updates to them
  (`LUCID_DISABLE_UPDATES=1` forces this anywhere).

Source checkouts never use this path: they keep the coordinated git updater (`electron/updater.cjs`,
see `AGENTS.md`), which validates and builds a frozen snapshot before replacing `dist`.

## macOS first launch

The DMG is ad-hoc signed but not notarized, so the first launch is blocked. Open the app once,
then go to System Settings, Privacy & Security, and choose **Open Anyway**. Later launches work
normally. The README tells users the same.

## Windows signing with SignPath Foundation (free for open source)

Unsigned installers work, but SmartScreen warns about them. [SignPath Foundation](https://signpath.org)
signs open-source releases for free with its own certificate.

1. Apply at https://signpath.org/apply with the public repository. Requirements include an OSI
   license (MIT), releases built by CI from public sources, and a code signing policy page in the
   repository that names the people who approve releases.
2. Once accepted, install the SignPath GitHub App on the repository and create a project with an
   artifact configuration for the Windows files. Store the API token as the repository secret
   `SIGNPATH_API_TOKEN` and the organization id as the variable `SIGNPATH_ORGANIZATION_ID`.
3. Sign in two passes so both the app and its installer carry the signature. In the Windows job:
   - build the unpacked app: `npx electron-builder --config electron-builder.config.cjs --win dir --publish never`
   - upload `release/win-unpacked` with `actions/upload-artifact`, then submit it with
     `signpath/github-action-submit-signing-request` and download the signed folder
   - build the installer from it:
     `npx electron-builder --config electron-builder.config.cjs --win nsis --prepackaged <signed folder> --publish never`
   - submit the installer for signing the same way, then refresh its update metadata, because
     signing changes the file: `node scripts/update-latest-yml.mjs release/latest.yml <signed installer>`
   - upload the signed installer and `latest.yml` to the draft release (for example with
     `gh release upload`). The `.blockmap` file no longer matches; delete it from the release so
     installed apps download the full installer.
4. After the first signed release, add `win.publisherName` (the certificate's subject name) to the
   config so electron-updater refuses installers signed by anyone else.

## App icons

`build/icons` is generated from the brand mark in `src/ui/brand-mark.ts`: `npm run icons`
(needs `rsvg-convert` from librsvg). The PNGs, `icon.ico` and `icon.icns` are committed, so
packaging and CI do not need librsvg.
