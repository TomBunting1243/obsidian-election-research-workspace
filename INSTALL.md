# Installation

## Starter vault

1. Download or clone this repository.
2. In Obsidian, choose **Open folder as vault** and select `demo-vault`.
3. Open **Settings → Community plugins** and turn off Restricted mode.
4. Browse for and install **Dataview**.
5. In Dataview settings, enable JavaScript queries.
6. Open `Elections/Election Research Demo.md`.

The included `.obsidian/community-plugins.json` declares Dataview as the intended dependency; Obsidian does not install community-plugin code from a repository automatically.

## Add it to an existing vault

Copy these folders while preserving their relative paths:

- `Resources/Views/election-race`
- `Resources/Data/Elections/races`
- Any example notes you want from `Elections`

Then embed a race dashboard in a note:

```js
await dv.view("Resources/Views/election-race", {
  raceId: "your-race-id"
});
```

If you keep sidecars elsewhere, supply a custom root:

```js
await dv.view("Resources/Views/election-race", {
  raceId: "your-race-id",
  dataRoot: "Research/Election Data"
});
```

The expected file is then `Research/Election Data/your-race-id/dashboard.json`.

## Validate after customization

Run:

```bash
python3 scripts/validate_workspace.py
python3 -m unittest discover -s tests -v
node --check demo-vault/Resources/Views/election-race/view.js
```
