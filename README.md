# Obsidian Election Research Workspace

A shareable starter vault for building interactive, source-aware election research dashboards in Obsidian.

This project extracts the reusable UI and data contract from a larger 2026 midterm research system built through sustained human-AI collaboration. The production workspace covers 176 races; this public template ships three fictional races so it can demonstrate the complete interface without redistributing live forecasts, proprietary model data, or private research notes.

## What it demonstrates

- One interactive dashboard per race, rendered from a small JSON sidecar.
- Candidate, forecast, polling, campaign-finance, historical-result, and model views.
- Keyboard-accessible view switching and responsive layouts.
- A clean boundary between handwritten research notes and generated data.
- A validator that checks every race before the workspace is treated as healthy.
- Synthetic fixtures suitable for screenshots, workshops, and automated tests.

## Try the demo

1. Copy `demo-vault` into a new or existing Obsidian vault.
2. Install and enable the community plugin **Dataview**.
3. Open `Elections/Election Research Demo.md`.
4. Follow the links to the three example race notes.

See [INSTALL.md](INSTALL.md) for the complete starter-vault and existing-vault paths.

Each race note embeds the same view:

```js
await dv.view("Resources/Views/election-race", { raceId: "demo-north-senate" });
```

The renderer loads `Resources/Data/Elections/races/<race-id>/dashboard.json`. Pass `dataRoot` in the view input if your vault uses a different layout.

## Repository layout

```text
demo-vault/
  Elections/                         Example notes
  Resources/Views/election-race/     Dataview JavaScript and CSS
  Resources/Data/Elections/races/    Synthetic JSON sidecars
scripts/validate_workspace.py        Schema and note-link validation
tests/                               Contract tests
```

## Why synthetic data?

The interface is reusable; a current election dataset is not automatically redistributable. Public political facts may still require attribution, while forecasts, polling aggregations, and model outputs can carry separate terms. The starter vault therefore uses invented jurisdictions, candidates, pollsters, and sources. Replace them with data you are licensed to use and cite every real source in the sidecar.

## Built with AI, governed by evidence

AI agents helped develop the original renderer, normalize heterogeneous inputs, extend the design from one state to every race, and build validation coverage. Human direction supplied the research model, editorial boundaries, UI judgment, and acceptance criteria. Generated sections were designed to leave handwritten analysis intact, and the production system was not considered healthy until all 176 race notes and 52 tests passed.

See [ARCHITECTURE.md](ARCHITECTURE.md) for the data flow and extension points.
See [HISTORY.md](HISTORY.md) for the distinction between the July prototype, the private 176-race workspace, and this public extraction.

## License

Apache-2.0. The demo data is fictional and provided only as a software fixture.
