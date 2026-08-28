# Architecture

## Data flow

```text
licensed/public sources
        |
        v
optional source adapters
        |
        v
normalized dashboard.json  --->  workspace validator
        |
        v
Dataview race renderer
        |
        v
interactive race note + handwritten analysis
```

The JSON sidecar is the boundary. A source adapter may fetch Wikipedia, an election authority, campaign-finance records, polling, or a model, but the renderer does not know how those sources were acquired. It only knows the normalized contract.

## Editorial boundary

In the production system, automation owns explicitly marked managed sections and synchronized properties. Human-written analysis lives outside those regions. Regeneration can replace structured tables and status blocks without overwriting commentary.

## Required runtime

- Obsidian
- Dataview with JavaScript queries enabled

Python is required only for the included validator or for custom desktop refresh adapters.

## Sidecar contract

Every `dashboard.json` requires:

- `schema_version`, `race_id`, `retrieved_at`, and `status`
- `source`, `source_url`, and `overview`
- `election_date`
- at least two `candidates`
- arrays for `ratings`, `models`, and `model_trend`
- structured `polling`, `campaign_finance`, `history`, and `election_calendar` objects

Unavailable data should be represented honestly with a status and reason, not invented to fill the interface.
