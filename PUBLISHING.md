# Publishing updates

InizioMail ships automatic updates via **electron-updater** + **GitHub Releases**.
Every installed copy checks for updates on launch, downloads new versions in the
background, and prompts the user to restart.

## One-time setup

1. Create a GitHub repository and push this project to it.
2. Confirm the repo coordinates in `package.json` match your repository:

   ```json
   "publish": [{ "provider": "github", "owner": "bartaantonio46", "repo": "iniziomail" }]
   ```

   Update `owner`/`repo` (and the `repository.url`) if your GitHub repo differs.
   The auto-updater reads these values to know where to look for releases.
3. No secrets to configure — the workflow uses the automatically provided
   `GITHUB_TOKEN`.

## Cutting a release

From a clean `main`:

```bash
npm version patch      # or: minor | major  -> bumps package.json, creates tag vX.Y.Z
git push --follow-tags # pushes commit + tag
```

Pushing the tag triggers `.github/workflows/release.yml`, which:

1. Builds the Windows NSIS installer with electron-builder.
2. Creates a GitHub Release for the tag.
3. Uploads the installer, `latest.yml`, and blockmap assets.

Installed clients pick up the new `latest.yml` on their next launch.

## Client behaviour

- On launch the app checks for updates automatically. If none, it continues
  silently.
- If an update exists it downloads in the background and shows a small
  bottom-right progress card.
- When the download completes the user is offered **Restart Now** / **Later**.
  "Later" installs automatically on the next app quit.
- A manual **Help ▸ Check for Updates…** menu item is always available.
  (On Windows the menu bar is hidden; press **Alt** to reveal it.)

## Versioning

Semantic versioning, driven by `package.json`. electron-updater only installs
versions **newer** than the running build, so re-running or downgrading tags is
safe.

## Logs & troubleshooting

electron-log writes to the per-user log file:

- Windows: `%USERPROFILE%\AppData\Roaming\InizioMail\logs\main.log`

Update checks are skipped in development (`npm start`); they run only in
packaged builds. Use **Check for Updates…** in a packaged build to see the
"development build" notice while testing locally.
