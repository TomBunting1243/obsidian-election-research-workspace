const container = dv.container;
[...container.children].filter(child => child.tagName !== "STYLE").forEach(child => child.remove());
// Race dashboards are an initial snapshot with local interaction state. Do
// not let Dataview metadata churn rebuild the chart/table DOM underneath them.
if (dv.component?.settings) {
  dv.component.settings = { ...dv.component.settings, refreshEnabled: false };
}
const raceId = String(input?.raceId ?? dv.current()?.["Race ID"] ?? "").trim();
const dataRoot = String(input?.dataRoot ?? "Resources/Data/Elections/races").replace(/\/$/, "");
const dashboardPath = `${dataRoot}/${raceId}/dashboard.json`;

if (!/^[a-z0-9][a-z0-9-]+$/.test(raceId)) {
  dv.paragraph("This race note does not have a valid `Race ID`, so its interactive dashboard cannot load.");
} else {
  const raw = await dv.io.load(dashboardPath);
  if (!raw) {
    dv.paragraph(`Race dashboard data is missing at \`${dashboardPath}\`. Run the desktop election refresh first.`);
  } else {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      dv.paragraph(`Race dashboard data at \`${dashboardPath}\` is invalid JSON: ${error.message}`);
    }

    if (data) {
      const page = dv.current();
      const root = container;
      root.classList.add("election-race-dashboard");
      root.setAttr("data-race-id", raceId);

      const value = key => page?.[key] ?? "";
      const candidates = Array.isArray(data.candidates) ? data.candidates : [];
      const ratings = Array.isArray(data.ratings) ? data.ratings : [];
      const models = Array.isArray(data.models) ? data.models : [];
      const modelTrend = Array.isArray(data.model_trend) ? data.model_trend : data.models.flatMap(model => (model.trend || []).map(point => ({ ...point, source: model.name })));
      const tracking = data.tracking && typeof data.tracking === "object" ? data.tracking : {};
      const trackingHistory = Array.isArray(data.tracking_history) ? data.tracking_history : [];
      const ratingChanges = Array.isArray(data.rating_changes) ? data.rating_changes : [];
      const modelChanges = Array.isArray(data.model_changes) ? data.model_changes : [];
      const displayDate = rawDate => {
        if (!rawDate) return "Not published";
        const parsed = new Date(rawDate);
        if (Number.isNaN(parsed.valueOf())) return String(rawDate);
        return new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC"
        }).format(parsed);
      };
      const displayTimestamp = rawDate => {
        if (!rawDate) return "Never";
        const parsed = new Date(rawDate);
        if (Number.isNaN(parsed.valueOf())) return String(rawDate);
        return new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short"
        }).format(parsed);
      };
      const electionStatus = () => {
        const election = new Date(`${data.election_date || "November 3, 2026"} 00:00:00`);
        if (Number.isNaN(election.valueOf())) return "Date pending";
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        election.setHours(0, 0, 0, 0);
        const days = Math.round((election - today) / 86400000);
        if (days < 0) return "Election completed";
        if (days === 0) return "Election day";
        return `${days.toLocaleString()} days away`;
      };
      const addLinkOrText = (parent, label, url, cls = "") => {
        if (url) {
          return parent.createEl("a", { text: label, href: url, cls });
        }
        return parent.createSpan({ text: label, cls });
      };
      const partyClass = party => {
        const normalized = String(party || "other").toLowerCase();
        if (normalized === "d") return "is-dem";
        if (normalized === "r") return "is-rep";
        if (normalized === "i") return "is-independent";
        return "is-other";
      };
      const partyLabel = party => {
        const normalized = String(party || "other").toLowerCase();
        if (normalized === "d") return "Democratic candidate";
        if (normalized === "r") return "Republican candidate";
        if (normalized === "i") return "Independent candidate";
        return "Other candidate";
      };
      const ratingPosition = rating => {
        const normalized = String(rating || "").toLowerCase();
        if (normalized.includes("toss")) return 3;
        const democratic = /\bd\b|democrat/.test(normalized);
        const republican = /\br\b|republican/.test(normalized);
        if (!democratic && !republican) return 3;
        const strength = /safe|solid|strong/.test(normalized)
          ? 3
          : /likely/.test(normalized)
            ? 2
            : 1;
        return democratic ? 3 - strength : 3 + strength;
      };
      const category = String(
        value("Classification")
          || (value("Race to Watch") ? "Race to Watch" : "")
          || tracking.tier
          || "Tracked race"
      );

      const header = root.createDiv({ cls: "election-race-dashboard__header" });
      const heading = header.createDiv();
      heading.createSpan({ cls: "election-race-dashboard__eyebrow", text: "2026 midterm workspace" });
      heading.createEl("h3", { text: "Live race dashboard" });
      heading.createEl("p", {
        text: `${models.length} quantitative model${models.length === 1 ? "" : "s"} · ${(data.polling?.records || data.recent_polls || []).length} recent poll${(data.polling?.records || data.recent_polls || []).length === 1 ? "" : "s"}`
      });
      header.createSpan({
        cls: "election-race-dashboard__category",
        text: category
      });

      const modelColors = ["#8b5cf6", "#f59e0b", "#10b981", "#ec4899", "#06b6d4", "#f97316"];
      const pct = number => Number.isFinite(Number(number)) ? `${Number(number).toFixed(1)}%` : "—";
      const exactMoney = value => value == null || value === "" || !Number.isFinite(Number(value))
        ? "Not reported"
        : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(Number(value));
      const money = value => value == null || value === "" || !Number.isFinite(Number(value))
        ? "—"
        : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(Number(value));
      const modelMargin = model => {
        const supplied = Number(model.dem_margin);
        if (Number.isFinite(supplied)) return `${supplied >= 0 ? "D+" : "R+"}${Math.abs(supplied).toFixed(1)}`;
        const dem = Number(model.dem_win_probability);
        const rep = Number(model.rep_win_probability);
        return Number.isFinite(dem) && Number.isFinite(rep) ? `${dem >= rep ? "D+" : "R+"}${Math.abs(dem - rep).toFixed(1)} pts` : "Margin unavailable";
      };
      const addProbabilityRing = (parent, model, index = 0) => {
        const dem = Number(model.dem_win_probability);
        const rep = Number(model.rep_win_probability);
        const ring = parent.createDiv({
          cls: "election-race-dashboard__probability-ring",
          attr: {
            role: "img",
            "aria-label": `${model.name || "Model"}: ${pct(dem)} Democratic win probability and ${pct(rep)} Republican win probability`,
            style: `--probability-dem: ${Number.isFinite(dem) ? Math.max(0, Math.min(100, dem)) : 0}%; --model-color: ${modelColors[index % modelColors.length]}`
          }
        });
        const center = ring.createDiv({ cls: "election-race-dashboard__probability-ring-center" });
        center.createEl("strong", { text: pct(dem) });
        center.createSpan({ text: "D win" });
        ring.setAttr("title", `${model.name || "Model"} · ${pct(dem)} D / ${pct(rep)} R`);
        return ring;
      };
      const modelCards = root.createDiv({ cls: "election-race-dashboard__model-cards" });
      if (models.length) {
        models.forEach((model, index) => {
          const card = modelCards.createEl("article", {
            cls: "election-race-dashboard__model-card",
            attr: { style: `--model-color: ${modelColors[index % modelColors.length]}` }
          });
          card.createSpan({ cls: "election-race-dashboard__model-card-source", text: model.name || "Model" });
          addProbabilityRing(card, model, index);
          const copy = card.createDiv({ cls: "election-race-dashboard__model-card-copy" });
          copy.createEl("strong", { text: `${pct(model.dem_win_probability)} D` });
          copy.createSpan({ text: `${modelMargin(model)} · ${model.rating || "Probability"}` });
          if (model.trend_status && model.trend_status !== "aligned") {
            copy.createEl("small", { text: `${model.trend_status} · latest ${model.trend_latest_date || "undated"}` });
          }
        });
      } else {
        modelCards.createDiv({ cls: "election-race-dashboard__availability", text: "No quantitative model feed is currently published for this race." });
      }

      const controls = root.createDiv({
        cls: "election-race-dashboard__controls",
        attr: { role: "tablist", "aria-label": "Race dashboard views" }
      });
      const tabPrefix = `race-${raceId}-dashboard`;
      const panel = root.createDiv({
        cls: "election-race-dashboard__panel",
        attr: { id: `${tabPrefix}-panel`, role: "tabpanel" }
      });
      const modes = [
        ["trend", "Model trend"],
        ["snapshot", "Model snapshot"],
        ["polls", "Recent polls"],
        ["finance", "Campaign finance"],
        ["history", "Election history"]
      ];
      const buttons = new Map();

      const emptyState = (message, parent = panel) => parent.createDiv({
        cls: "election-race-dashboard__empty",
        text: message
      });
      const createSection = (title, parent = panel) => {
        const section = parent.createEl("section", { cls: "election-race-dashboard__detail-section" });
        section.createEl("h4", { text: title });
        return section;
      };
      const renderSourceStatus = (parent, label, message, sourceUrl = data.source_url, blockStatus = data.status, blockChecked = data.retrieved_at) => {
        const state = parent.createDiv({ cls: "election-race-dashboard__availability" });
        state.createSpan({ cls: "election-race-dashboard__availability-label", text: label });
        state.createEl("p", { text: message });
        const details = state.createEl("dl", { cls: "election-race-dashboard__source-grid" });
        for (const [term, description] of [
          ["Feed status", blockStatus || "unknown"],
          ["Last checked", displayTimestamp(blockChecked)],
          ["Source", data.source || "Current election source"]
        ]) {
          details.createEl("dt", { text: term });
          details.createEl("dd", { text: description });
        }
        addLinkOrText(state, "Open current source ↗", sourceUrl, "election-race-dashboard__source-link mod-cta");
      };

      const renderCandidates = (parent = panel) => {
        if (!candidates.length) {
          emptyState("No general-election candidate field is available from the current source yet.", parent);
          return;
        }
        const grid = parent.createDiv({ cls: "election-race-dashboard__candidate-grid" });
        for (const candidate of candidates) {
          const card = grid.createEl("article", {
            cls: `election-race-dashboard__candidate ${partyClass(candidate.party)}`
          });
          card.createSpan({ cls: "election-race-dashboard__party", text: partyLabel(candidate.party) });
          addLinkOrText(card, candidate.name, candidate.url, "election-race-dashboard__candidate-name");
          card.createEl("small", { text: candidate.url ? "Biography source available" : "Biography link pending" });
        }
      };

      const renderRatings = (parent = panel) => {
        const intro = parent.createDiv({ cls: "election-race-dashboard__ratings-intro" });
        intro.createEl("p", {
          text: "Each forecaster stays separate. The spectrum visualizes categorical labels only; it does not turn them into probabilities or average them."
        });
        const scale = parent.createDiv({ cls: "election-race-dashboard__rating-scale" });
        for (const label of ["Safe D", "Likely D", "Lean D", "Tossup", "Lean R", "Likely R", "Safe R"]) {
          scale.createSpan({ text: label });
        }
        if (!ratings.length) {
          emptyState("No structured general-election ratings are currently published on the source page.", parent);
          return;
        }
        const list = parent.createDiv({ cls: "election-race-dashboard__ratings" });
        for (const rating of ratings) {
          const row = list.createEl("article", { cls: "election-race-dashboard__rating" });
          const copy = row.createDiv({ cls: "election-race-dashboard__rating-copy" });
          copy.createEl("strong", { text: rating.source });
          copy.createSpan({ text: `${rating.rating}${rating.as_of ? ` · ${rating.as_of}` : ""}` });
          const track = row.createDiv({ cls: "election-race-dashboard__rating-track" });
          const position = ratingPosition(rating.rating);
          track.createSpan({
            cls: `election-race-dashboard__rating-marker ${position < 3 ? "is-dem" : position > 3 ? "is-rep" : "is-tossup"}`,
            attr: {
              style: `grid-column: ${position + 1}`,
              title: rating.rating,
              "aria-label": rating.rating
            }
          });
        }
      };

      const renderModels = (parent = panel) => {
        const section = createSection("Quantitative model support", parent);
        if (!models.length) {
          renderSourceStatus(
            section,
            "Model feed pending",
            "No quantitative probability feed is normalized for this race yet. Rating, source, and candidate-change tracking remains active."
          );
          return;
        }
        section.createEl("p", {
          text: "Model outputs stay source-separated. Probabilities describe the named model's forecast and are not averaged with categorical forecaster ratings.",
          cls: "election-race-dashboard__model-intro"
        });
        const list = section.createDiv({ cls: "election-race-dashboard__model-list" });
        for (const [index, model] of models.entries()) {
          const row = list.createEl("article", { cls: "election-race-dashboard__model" });
          const header = row.createDiv({ cls: "election-race-dashboard__model-header" });
          addLinkOrText(header, model.name || "Model", model.url, "election-race-dashboard__model-name");
          header.createSpan({ text: model.updated_at ? `updated ${displayTimestamp(model.updated_at)}` : "updated timestamp unavailable" });
          const dem = Number(model.dem_win_probability);
          const rep = Number(model.rep_win_probability);
          const valid = Number.isFinite(dem) && Number.isFinite(rep);
          if (!valid) {
            emptyState("Probability values are not currently published for this model.", row);
            continue;
          }
          const modelBody = row.createDiv({ cls: "election-race-dashboard__model-body" });
          addProbabilityRing(modelBody, model, index);
          const modelDetails = modelBody.createDiv({ cls: "election-race-dashboard__model-details" });
          const values = modelDetails.createDiv({ cls: "election-race-dashboard__model-values" });
          values.createEl("strong", { text: `${dem.toFixed(1)}% D` });
          values.createSpan({ text: `${rep.toFixed(1)}% R` });
          const track = modelDetails.createDiv({ cls: "election-race-dashboard__model-track", attr: { role: "img", "aria-label": `${dem.toFixed(1)} percent Democratic win probability and ${rep.toFixed(1)} percent Republican win probability` } });
          track.createSpan({ cls: "election-race-dashboard__model-fill is-dem", attr: { style: `width: ${Math.max(0, Math.min(100, dem))}%` } });
          if (model.trend_status && model.trend_status !== "aligned") {
            modelDetails.createEl("small", { text: `${model.trend_status} · latest trend ${model.trend_latest_date || "undated"}` });
          }
        }
      };

      const renderTracking = (parent = panel) => {
        const section = createSection("Tracking contract", parent);
        const stats = section.createDiv({ cls: "election-race-dashboard__stats" });
        for (const [label, primary, secondary] of [
          ["Tracking tier", tracking.tier || "Context", tracking.priority ? "Competitive or Tom's Pick" : "Context race"],
          ["Sync status", data.status || "unknown", data.retrieved_at ? `source checked ${displayTimestamp(data.retrieved_at)}` : "source timestamp unavailable"],
          ["Source snapshots", String(tracking.snapshot_count ?? trackingHistory.length), tracking.last_checked_at ? `checked ${displayTimestamp(tracking.last_checked_at)}` : "Retained after refresh"],
          ["Rating changes", String(tracking.rating_change_count ?? ratingChanges.length), tracking.last_rating_change_at ? `last ${displayTimestamp(tracking.last_rating_change_at)}` : "No change recorded yet"],
          ["Model changes", String(tracking.model_change_count ?? modelChanges.length), tracking.last_model_change_at ? `last ${displayTimestamp(tracking.last_model_change_at)}` : "No change recorded yet"]
        ]) {
          const card = stats.createEl("article", { cls: "election-race-dashboard__stat" });
          card.createSpan({ text: label });
          card.createEl("strong", { text: primary });
          card.createEl("small", { text: secondary });
        }
        section.createEl("p", {
          text: tracking.model_support || "Source-separated model and forecaster tracking is active.",
          cls: "election-race-dashboard__tracking-copy"
        });
        const metrics = Array.isArray(tracking.metrics) ? tracking.metrics : [];
        if (metrics.length) {
          const list = section.createDiv({ cls: "election-race-dashboard__metric-list" });
          for (const metric of metrics) list.createSpan({ text: metric });
        }
      };

      const renderPollTimeline = (parent, polls) => {
        const records = polls.map((poll, index) => {
          const dem = Number(poll.dem_share ?? poll.dem);
          const rep = Number(poll.rep_share ?? poll.rep);
          const rawDate = poll.fieldwork_end || poll.fieldwork_start || poll.source_added_date || poll.date;
          const parsed = rawDate ? new Date(String(rawDate).slice(0, 10)) : null;
          return {
            poll,
            index,
            dem: Number.isFinite(dem) ? dem : null,
            rep: Number.isFinite(rep) ? rep : null,
            date: parsed && !Number.isNaN(parsed.valueOf()) ? parsed.toISOString().slice(0, 10) : ""
          };
        }).filter(record => record.dem != null || record.rep != null)
          .sort((a, b) => (a.date || "9999-12-31").localeCompare(b.date || "9999-12-31"));
        if (records.length < 2) return;
        const section = parent.createEl("section", { cls: "election-race-dashboard__poll-timeline-section" });
        section.createEl("h5", { text: "Poll movement" });
        section.createEl("p", {
          text: "Hover or focus a fieldwork point to compare the Democratic and Republican shares; click to pin the readout.",
          cls: "election-race-dashboard__tracking-copy"
        });
        const readout = section.createDiv({ cls: "election-race-dashboard__poll-readout", attr: { "aria-live": "polite", "aria-atomic": "true" } });
        const readoutDate = readout.createEl("time", { cls: "election-race-dashboard__timeline-readout-date" });
        const readoutValues = readout.createDiv({ cls: "election-race-dashboard__timeline-readout-items" });
        const host = section.createDiv({ cls: "election-race-dashboard__poll-timeline" });
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "election-race-dashboard__timeline-svg");
        svg.setAttribute("viewBox", "0 0 760 250");
        svg.setAttribute("role", "img");
        svg.setAttribute("aria-label", "Published Democratic and Republican poll shares over time");
        host.appendChild(svg);
        const width = 760;
        const height = 250;
        const margins = { top: 24, right: 22, bottom: 38, left: 46 };
        const plotWidth = width - margins.left - margins.right;
        const plotHeight = height - margins.top - margins.bottom;
        const values = records.flatMap(record => [record.dem, record.rep]).filter(Number.isFinite);
        const minimum = Math.max(0, Math.floor(Math.min(...values) - 5));
        const maximum = Math.min(100, Math.ceil(Math.max(...values) + 5));
        const xFor = index => margins.left + plotWidth * index / Math.max(1, records.length - 1);
        const yFor = value => margins.top + plotHeight - ((value - minimum) / Math.max(1, maximum - minimum)) * plotHeight;
        const addSvg = (tag, attrs = {}, textValue = "") => {
          const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
          Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, String(value)));
          if (textValue) element.textContent = textValue;
          svg.appendChild(element);
          return element;
        };
        for (const tick of [minimum, Math.round((minimum + maximum) / 2), maximum]) {
          const y = yFor(tick);
          addSvg("line", { class: "election-race-dashboard__timeline-grid", x1: margins.left, x2: margins.left + plotWidth, y1: y, y2: y });
          addSvg("text", { class: "election-race-dashboard__timeline-axis", x: margins.left - 8, y: y + 4, "text-anchor": "end" }, `${tick}%`);
        }
        const labelIndexes = records.length <= 4 ? records.map((_, index) => index) : [0, Math.floor((records.length - 1) / 2), records.length - 1];
        for (const index of [...new Set(labelIndexes)]) {
          addSvg("text", { class: "election-race-dashboard__timeline-axis", x: xFor(index), y: height - 11, "text-anchor": "middle" }, displayDate(records[index].date));
        }
        const guide = addSvg("line", { class: "election-race-dashboard__timeline-guide", x1: xFor(records.length - 1), x2: xFor(records.length - 1), y1: margins.top, y2: margins.top + plotHeight });
        for (const [key, color] of [["dem", "#2f7bdc"], ["rep", "#d84a4a"]]) {
          const points = records.map((record, index) => record[key] == null ? null : ({ index, x: xFor(index), y: yFor(record[key]), value: record[key] })).filter(Boolean);
          if (!points.length) continue;
          addSvg("path", { class: "election-race-dashboard__timeline-path", d: points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" "), stroke: color });
          points.forEach(point => addSvg("circle", { class: `election-race-dashboard__poll-point is-${key}`, cx: point.x, cy: point.y, r: 3, fill: color }));
        }
        const hitAreas = [];
        let pinned = false;
        const updateReadout = index => {
          const safeIndex = Math.max(0, Math.min(records.length - 1, index));
          const record = records[safeIndex];
          guide.setAttribute("x1", xFor(safeIndex));
          guide.setAttribute("x2", xFor(safeIndex));
          hitAreas.forEach((target, targetIndex) => target.setAttribute("aria-pressed", String(targetIndex === safeIndex)));
          readoutDate.textContent = record.date ? displayDate(record.date) : (record.poll.fieldwork || "Published poll");
          readoutValues.replaceChildren();
          for (const [label, value, color] of [["Democratic", record.dem, "#2f7bdc"], ["Republican", record.rep, "#d84a4a"]]) {
            const row = readoutValues.createDiv({ cls: "election-race-dashboard__timeline-readout-item" });
            row.createSpan({ cls: "election-race-dashboard__timeline-readout-source", text: label });
            row.createEl("strong", { text: value == null ? "No result" : `${value.toFixed(1)}%` , attr: { style: `color:${color}` } });
            row.createSpan({ text: [record.poll.pollster || record.poll.source, record.poll.fieldwork, record.poll.sample, record.poll.poll_details].filter(Boolean).join(" · ") });
          }
        };
        records.forEach((record, index) => {
          const left = index === 0 ? margins.left : (xFor(index - 1) + xFor(index)) / 2;
          const right = index === records.length - 1 ? margins.left + plotWidth : (xFor(index) + xFor(index + 1)) / 2;
          const target = addSvg("rect", {
            class: "election-race-dashboard__timeline-hit-area",
            x: left,
            y: margins.top,
            width: Math.max(1, right - left),
            height: plotHeight,
            tabindex: 0,
            role: "button",
            "aria-label": `${record.poll.pollster || "Poll"} ${record.date || record.poll.fieldwork || "undated"} observations`,
            "aria-pressed": String(index === records.length - 1)
          });
          target.addEventListener("pointerenter", () => { if (!pinned) updateReadout(index); });
          target.addEventListener("focus", () => updateReadout(index));
          target.addEventListener("click", () => { pinned = true; updateReadout(index); });
          target.addEventListener("keydown", event => {
            if (event.key === "Escape") { pinned = false; updateReadout(records.length - 1); return; }
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              pinned = false;
              const next = event.key === "Home" ? 0 : event.key === "End" ? records.length - 1 : Math.max(0, Math.min(records.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)));
              hitAreas[next]?.focus();
              updateReadout(next);
            }
          });
          hitAreas.push(target);
        });
        updateReadout(records.length - 1);
      };

      const renderSnapshot = () => {
        const stats = panel.createDiv({ cls: "election-race-dashboard__stats" });
        const statRows = [
          ["Election day", displayDate(data.election_date), electionStatus()],
          ["Candidate field", String(candidates.length), candidates.length === 2 ? "Major-party pair loaded" : "Current published field"],
          ["Model support", String(models.length), models.length ? "Quantitative model feed" : "Feed pending"],
          ["Forecasters", String(ratings.length), ratings.length ? "Categorical ratings" : "None published"],
          ["Classification", value("Classification") || "Unclassified", value("Race to Watch") ? "On watchlist" : "Tracked race"]
        ];
        for (const [label, primary, secondary] of statRows) {
          const card = stats.createEl("article", { cls: "election-race-dashboard__stat" });
          card.createSpan({ text: label });
          card.createEl("strong", { text: primary });
          card.createEl("small", { text: secondary });
        }
        renderCandidates(createSection("Candidate matchup"));
        renderModels();
        renderRatings(createSection("Published model and forecaster ratings"));
        renderTracking();
        const overview = createSection("Source overview");
        const overviewHeader = overview.createDiv({ cls: "election-race-dashboard__section-header" });
        addLinkOrText(overviewHeader, "Open current race source ↗", data.source_url, "election-race-dashboard__source-link");
        const paragraphs = String(data.overview || "The current source has not published a stable overview yet.")
          .split(/\n\s*\n/)
          .filter(Boolean);
        for (const paragraph of paragraphs) overview.createEl("p", { text: paragraph });
      };

      let trendPreset = "all";
      let trendPinned = false;
      let trendSelectionIndex = -1;

      const renderTrend = () => {
        const section = createSection("Model trend");
        const trend = modelTrend
          .filter(point => point?.date && Number.isFinite(Number(point.dem_win_probability)))
          .map(point => ({
            ...point,
            source: String(point.source || "Model"),
            date: String(point.date).slice(0, 10),
            dem_win_probability: Number(point.dem_win_probability)
          }))
          .sort((a, b) => a.date.localeCompare(b.date));
        if (trend.length) {
          const bySource = new Map();
          for (const point of trend) {
            if (!bySource.has(point.source)) bySource.set(point.source, []);
            bySource.get(point.source).push(point);
          }
          const trendStatusBySource = new Map(
            models.map(model => [String(model.name || model.id || "Model"), {
              status: model.trend_status || (Array.isArray(model.trend) && model.trend.length ? "aligned" : "not_published"),
              reason: model.trend_reason || "No dated trend observations are currently available for this model."
            }])
          );
          const sources = [...new Set([
            ...bySource.keys(),
            ...models.map(model => String(model.name || model.id || "Model"))
          ])].sort((a, b) => a.localeCompare(b));
          const allDates = [...new Set(trend.map(point => point.date))].sort();
          const latestDate = allDates.at(-1);
          const rangeDays = { "30d": 30, "90d": 90 };
          const datesForPreset = preset => {
            const days = rangeDays[preset];
            if (!days || !latestDate) return allDates;
            const cutoff = new Date(`${latestDate}T00:00:00Z`);
            cutoff.setUTCDate(cutoff.getUTCDate() - days + 1);
            const minimum = cutoff.toISOString().slice(0, 10);
            return allDates.filter(date => date >= minimum);
          };
          const dates = datesForPreset(trendPreset);
          const visibleDates = dates.length ? dates : allDates;
          const pointsBySource = new Map(sources.map(source => [
            source,
            (bySource.get(source) || []).filter(point => visibleDates.includes(point.date))
          ]));
          section.createEl("p", {
            text: `${tracking.tier || "Context"} tracking retains ${trend.length} dated probability points across ${sources.length} source${sources.length === 1 ? "" : "s"}. Hover or focus a date to compare source-separated movement; click to pin it.`,
            cls: "election-race-dashboard__tracking-copy"
          });

          const toolbar = section.createDiv({
            cls: "election-race-dashboard__timeline-toolbar",
            attr: { role: "group" }
          });
          const trendRangeLabelId = `${tabPrefix}-trend-range-label`;
          toolbar.createSpan({
            cls: "election-race-dashboard__sr-only",
            text: "Model trend range",
            attr: { id: trendRangeLabelId }
          });
          toolbar.setAttr("aria-labelledby", trendRangeLabelId);
          for (const [key, label] of [["30d", "30 days"], ["90d", "90 days"], ["all", "All history"]]) {
            const button = toolbar.createEl("button", {
              text: label,
              cls: trendPreset === key ? "is-active" : "",
              attr: { type: "button", "aria-pressed": String(trendPreset === key) }
            });
            button.addEventListener("click", () => {
              trendPreset = key;
              trendPinned = false;
              trendSelectionIndex = -1;
              render("trend");
            });
          }

          const legend = section.createDiv({ cls: "election-race-dashboard__timeline-legend", attr: { "aria-label": "Model legend" } });
          sources.forEach((source, index) => {
            const status = trendStatusBySource.get(source);
            const item = legend.createDiv({
              cls: `election-race-dashboard__timeline-legend-item${status?.status === "not_published" ? " is-unavailable" : ""}`,
              attr: status?.reason ? { title: status.reason } : {}
            });
            item.createSpan({ cls: "election-race-dashboard__timeline-swatch", attr: { style: `--timeline-color: ${["#2f7bdc", "#d84a4a", "#16a085", "#9b59b6", "#e67e22"][index % 5]}` } });
            item.createSpan({ text: source });
            if (status?.status === "not_published") item.createEl("small", { text: "no dated trend" });
          });

          const readout = section.createDiv({
            cls: "election-race-dashboard__timeline-readout",
            attr: { "aria-live": "polite", "aria-atomic": "true" }
          });
          const readoutDate = readout.createEl("time", { cls: "election-race-dashboard__timeline-readout-date" });
          const readoutItems = readout.createDiv({ cls: "election-race-dashboard__timeline-readout-items" });
          const host = section.createDiv({ cls: "election-race-dashboard__timeline" });
          const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          svg.setAttribute("class", "election-race-dashboard__timeline-svg");
          svg.setAttribute("viewBox", "0 0 760 300");
          svg.setAttribute("role", "img");
          svg.setAttribute("aria-label", "Democratic win probability by model over time");
          host.appendChild(svg);

          const width = 760;
          const height = 300;
          const margins = { top: 22, right: 22, bottom: 38, left: 46 };
          const plotWidth = width - margins.left - margins.right;
          const plotHeight = height - margins.top - margins.bottom;
          const xFor = index => margins.left + (plotWidth * index) / Math.max(1, visibleDates.length - 1);
          const yFor = value => margins.top + plotHeight - (Math.max(0, Math.min(100, value)) / 100) * plotHeight;
          const svgElement = (tag, attributes = {}, text = "") => {
            const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
            Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
            if (text) element.textContent = text;
            svg.appendChild(element);
            return element;
          };
          const colors = new Map(sources.map((source, index) => [source, ["#2f7bdc", "#d84a4a", "#16a085", "#9b59b6", "#e67e22"][index % 5]]));
          const guide = svgElement("line", {
            class: "election-race-dashboard__timeline-guide",
            x1: xFor(visibleDates.length - 1),
            x2: xFor(visibleDates.length - 1),
            y1: margins.top,
            y2: margins.top + plotHeight
          });
          for (const tick of [0, 25, 50, 75, 100]) {
            const y = yFor(tick);
            svgElement("line", { class: "election-race-dashboard__timeline-grid", x1: margins.left, x2: margins.left + plotWidth, y1: y, y2: y });
            svgElement("text", { class: "election-race-dashboard__timeline-axis", x: margins.left - 8, y: y + 4, "text-anchor": "end" }, `${tick}%`);
          }
          for (const event of Array.isArray(data.election_calendar?.events) ? data.election_calendar.events : []) {
            const eventIndex = visibleDates.indexOf(String(event.date || "").slice(0, 10));
            if (eventIndex < 0) continue;
            const x = xFor(eventIndex);
            svgElement("line", {
              class: "election-race-dashboard__timeline-event",
              x1: x,
              x2: x,
              y1: margins.top,
              y2: margins.top + plotHeight,
              "data-kind": event.kind || "event"
            });
            svgElement("text", {
              class: "election-race-dashboard__timeline-event-label",
              x,
              y: margins.top + 10,
              "text-anchor": "middle"
            }, String(event.short_label || event.label || "Event").slice(0, 18));
          }
          const labelIndexes = visibleDates.length <= 5
            ? visibleDates.map((_, index) => index)
            : [0, Math.floor((visibleDates.length - 1) / 2), visibleDates.length - 1];
          for (const index of [...new Set(labelIndexes)]) {
            svgElement("text", { class: "election-race-dashboard__timeline-axis", x: xFor(index), y: height - 11, "text-anchor": "middle" }, displayDate(visibleDates[index]));
          }

          const pointElements = new Map();
          const pointAt = (source, date) => (bySource.get(source) || []).find(point => point.date === date) || null;
          const pointThrough = (source, date) => (bySource.get(source) || []).filter(point => point.date <= date).at(-1) || null;
          for (const source of sources) {
            const points = visibleDates.map((date, index) => {
              const point = pointAt(source, date);
              return point ? { point, index, x: xFor(index), y: yFor(point.dem_win_probability) } : null;
            }).filter(Boolean);
            if (!points.length) continue;
            const path = points.map((entry, index) => `${index ? "L" : "M"}${entry.x.toFixed(2)},${entry.y.toFixed(2)}`).join(" ");
            svgElement("path", { class: "election-race-dashboard__timeline-path", d: path, stroke: colors.get(source) });
            pointElements.set(source, points.map(entry => {
              const point = svgElement("circle", {
                class: "election-race-dashboard__timeline-point",
                cx: entry.x,
                cy: entry.y,
                r: 3,
                fill: colors.get(source)
              });
              return { ...entry, element: point };
            }));
          }

          const findPrevious = (source, point) => {
            const points = bySource.get(source) || [];
            const index = points.findIndex(candidate => candidate.date === point.date);
            return index > 0 ? points[index - 1] : null;
          };
          const formatDelta = (point, previous) => {
            if (!previous) return "first observed point";
            const delta = point.dem_win_probability - previous.dem_win_probability;
            return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts since ${displayDate(previous.date)}`;
          };
          const updateReadout = index => {
            const date = visibleDates[index];
            if (!date) return;
            guide.setAttribute("x1", xFor(index));
            guide.setAttribute("x2", xFor(index));
            hitAreas.forEach((target, targetIndex) => target.setAttribute("aria-pressed", String(targetIndex === index)));
            pointElements.forEach(entries => entries.forEach(entry => entry.element.classList.toggle("is-active", entry.index === index)));
            readoutDate.textContent = displayDate(date);
            readoutItems.replaceChildren();
            for (const source of sources) {
              const point = pointThrough(source, date);
              const row = readoutItems.createDiv({ cls: "election-race-dashboard__timeline-readout-item" });
              row.createSpan({ cls: "election-race-dashboard__timeline-readout-source", text: source });
              if (!point) {
                const status = trendStatusBySource.get(source);
                row.createEl("strong", { text: status?.status === "not_published" ? "No dated trend" : "No observation" });
                if (status?.reason) row.createSpan({ text: status.reason });
                continue;
              }
              const previous = findPrevious(source, point);
              if (point.date !== date) row.setAttr("title", `Observation dated ${displayDate(point.date)}`);
              row.createEl("strong", { text: `${point.dem_win_probability.toFixed(1)}% D` });
              row.createSpan({ text: formatDelta(point, previous) });
            }
          };
          const hitAreas = [];
          visibleDates.forEach((date, index) => {
            const left = index === 0 ? margins.left : (xFor(index - 1) + xFor(index)) / 2;
            const right = index === visibleDates.length - 1 ? margins.left + plotWidth : (xFor(index) + xFor(index + 1)) / 2;
            const target = svgElement("rect", {
              class: "election-race-dashboard__timeline-hit-area",
              x: left,
              y: margins.top,
              width: Math.max(1, right - left),
              height: plotHeight,
              tabindex: 0,
              role: "button",
              "aria-pressed": index === visibleDates.length - 1 ? "true" : "false",
              "aria-label": `${displayDate(date)} model observations`
            });
            target.addEventListener("pointerenter", () => { if (!trendPinned) updateReadout(index); });
            target.addEventListener("focus", () => updateReadout(index));
            target.addEventListener("click", () => { trendPinned = true; updateReadout(index); });
            target.addEventListener("keydown", event => {
              if (event.key === "Escape") {
                event.preventDefault();
                trendPinned = false;
                const latest = visibleDates.length - 1;
                hitAreas[latest]?.focus();
                updateReadout(latest);
                return;
              }
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                trendPinned = false;
                const next = event.key === "Home" ? 0 : event.key === "End" ? visibleDates.length - 1 : Math.max(0, Math.min(visibleDates.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)));
                hitAreas[next]?.focus();
                updateReadout(next);
                return;
              }
              if (["Enter", " "].includes(event.key)) {
                event.preventDefault();
                trendPinned = true;
                updateReadout(index);
              }
            });
            hitAreas.push(target);
          });
          trendSelectionIndex = trendSelectionIndex >= 0 && trendSelectionIndex < visibleDates.length ? trendSelectionIndex : visibleDates.length - 1;
          updateReadout(trendSelectionIndex);

          const details = section.createEl("details", { cls: "election-race-dashboard__timeline-data" });
          details.createEl("summary", { text: "Show dated model observations" });
          const table = details.createEl("table");
          const head = table.createEl("thead").createEl("tr");
          for (const label of ["Model", "Date", "D win probability", "Change since prior"]) head.createEl("th", { text: label });
          const body = table.createEl("tbody");
          for (const source of sources) {
            for (const point of pointsBySource.get(source) || []) {
              const row = body.createEl("tr");
              row.createEl("th", { scope: "row", text: source });
              row.createEl("td", { text: displayDate(point.date) });
              row.createEl("td", { text: `${point.dem_win_probability.toFixed(1)}% D` });
              row.createEl("td", { text: formatDelta(point, findPrevious(source, point)) });
            }
          }
          section.createEl("p", {
            cls: "election-race-dashboard__sync-note",
            text: `Feed sync ${data.status || "unknown"} · source checked ${displayTimestamp(data.retrieved_at)}. This timestamp describes data freshness, not a forecast.`
          });
          return;
        }
        const trendGaps = models.filter(model => !Array.isArray(model.trend) || !model.trend.length);
        if (trendGaps.length) {
          const state = section.createDiv({ cls: "election-race-dashboard__availability" });
          state.createSpan({ cls: "election-race-dashboard__availability-label", text: "Dated trend availability" });
          state.createEl("p", {
            text: "A current model snapshot is available, but the source has not published dated trend observations for the model(s) below. This is a source gap, not an inferred trend."
          });
          const list = state.createEl("ul");
          for (const model of trendGaps) {
            const item = list.createEl("li");
            item.createEl("strong", { text: model.name || model.id || "Model" });
            item.createSpan({ text: ` — ${model.trend_reason || "No dated trend observations are currently available."}` });
          }
        }
        if (!trackingHistory.length && !trendGaps.length) {
          renderSourceStatus(
            section,
            "Not published",
            "This race feed does not currently expose a quantitative probability or margin time series. Current categorical ratings remain available in Model snapshot."
          );
          return;
        }
        const list = section.createDiv({ cls: "election-race-dashboard__record-list" });
        for (const snapshot of trackingHistory.slice(-12).reverse()) {
          const row = list.createEl("article");
          row.createEl("strong", { text: "Source snapshot" });
          row.createSpan({ text: `${displayTimestamp(snapshot.captured_at)} · ${snapshot.ratings?.length || 0} ratings · ${snapshot.candidates?.length || 0} candidates` });
        }
      };

      const renderPolls = () => {
        const section = createSection("Recent polls");
        const polling = data.polling && typeof data.polling === "object" ? data.polling : {};
        const polls = Array.isArray(polling.records) ? polling.records : (Array.isArray(data.recent_polls) ? data.recent_polls : []);
        if (!polls.length) {
          renderSourceStatus(
            section,
            polling.status || "No structured polling feed",
            polling.reason || "No poll-level fieldwork, sample, sponsor, and candidate-result records are normalized for this race yet. The current race source remains linked for manual review.",
            polling.source_url || data.source_url,
            polling.status,
            polling.retrieved_at || data.retrieved_at
          );
          return;
        }
        renderPollTimeline(section, polls);
        const list = section.createDiv({ cls: "election-race-dashboard__record-list" });
        for (const poll of polls) {
          const row = list.createEl("article");
          row.createEl("strong", { text: poll.pollster || poll.source || "Poll" });
          const dem = poll.dem_share ?? poll.dem;
          const rep = poll.rep_share ?? poll.rep;
          const margin = Number.isFinite(Number(poll.dem_margin)) ? `${Number(poll.dem_margin) >= 0 ? "D+" : "R+"}${Math.abs(Number(poll.dem_margin)).toFixed(1)}` : "margin unavailable";
          row.createSpan({ text: [poll.fieldwork || poll.fieldwork_end, dem != null ? `${Number(dem).toFixed(1)}% D` : "", rep != null ? `${Number(rep).toFixed(1)}% R` : "", margin, poll.poll_details || poll.note].filter(Boolean).join(" · ") });
          addLinkOrText(row, "source ↗", poll.source_url, "election-race-dashboard__record-link");
        }
        section.createEl("p", { text: `${polls.length} structured record${polls.length === 1 ? "" : "s"} · ${polling.status || "source status unavailable"}`, cls: "election-race-dashboard__sync-note" });
      };

      const renderFinance = () => {
        const section = createSection("Campaign finance");
        const finance = data.campaign_finance;
        const records = Array.isArray(finance?.candidates) ? finance.candidates : [];
        if (records.length) {
          const independent = Array.isArray(finance?.independent_expenditures) ? finance.independent_expenditures : [];
          const outsideByCandidate = new Map();
          for (const item of independent) {
            const id = String(item.candidate_id || "");
            const current = outsideByCandidate.get(id) || { support: 0, oppose: 0 };
            const key = String(item.support_oppose || "").toLowerCase() === "support" ? "support" : "oppose";
            current[key] += Number(item.total) || 0;
            outsideByCandidate.set(id, current);
          }
          const grid = section.createDiv({ cls: "election-race-dashboard__finance-grid" });
          for (const [index, record] of records.entries()) {
            const card = grid.createEl("article", { cls: `election-race-dashboard__finance-card ${partyClass(record.party)}`, attr: { style: `--model-color: ${modelColors[index % modelColors.length]}` } });
            const cardHeader = card.createDiv({ cls: "election-race-dashboard__finance-card-header" });
            cardHeader.createEl("strong", { text: record.candidate || record.name || "Candidate" });
            cardHeader.createSpan({ text: record.party || "—" });
            if (record.candidate_status === "filing_only") cardHeader.createEl("small", { text: "FEC filing only" });
            const raised = card.createDiv({ cls: "election-race-dashboard__finance-raised" });
            raised.createEl("strong", { text: money(record.raised), attr: { title: exactMoney(record.raised) } });
            raised.createSpan({ text: "raised" });
            const metrics = card.createDiv({ cls: "election-race-dashboard__finance-metrics" });
            for (const [label, field] of [["Spent", "spent"], ["Cash", "cash_on_hand"], ["Debt", "debts"]]) {
              const metric = metrics.createDiv({ cls: "election-race-dashboard__finance-metric" });
              metric.createEl("strong", { text: money(record[field]), attr: { title: exactMoney(record[field]) } });
              metric.createSpan({ text: label });
            }
            const outside = outsideByCandidate.get(String(record.candidate_id || ""));
            if (outside || record.outside_support != null || record.outside_oppose != null) {
              const support = outside?.support ?? (Number.isFinite(Number(record.outside_support)) ? Number(record.outside_support) : 0);
              const oppose = outside?.oppose ?? (Number.isFinite(Number(record.outside_oppose)) ? Number(record.outside_oppose) : 0);
              const outsideRow = card.createDiv({ cls: "election-race-dashboard__finance-outside" });
              outsideRow.createSpan({ text: "Independent expenditures" });
              outsideRow.createEl("strong", { text: `${money(support)} support · ${money(oppose)} oppose`, attr: { title: `${exactMoney(support)} support; ${exactMoney(oppose)} oppose` } });
            }
            const footer = card.createDiv({ cls: "election-race-dashboard__finance-footer" });
            footer.createSpan({ text: record.coverage_end_date ? `Through ${displayDate(record.coverage_end_date)}` : "Coverage date unavailable" });
            addLinkOrText(footer, "FEC filing ↗", record.source_url, "election-race-dashboard__record-link");
          }
          section.createEl("p", { text: `${records.length} candidate filing record${records.length === 1 ? "" : "s"} · ${finance.status || "source status unavailable"}`, cls: "election-race-dashboard__sync-note" });
          if (finance.outside_spending_status || finance.outside_spending_reason) {
            section.createEl("p", { text: `Independent spending: ${finance.outside_spending_status || "not reported"} · ${finance.outside_spending_reason || "Separate Schedule E totals are not included in the candidate totals."}`, cls: "election-race-dashboard__sync-note" });
          }
          return;
        }
        const office = String(value("Office") || "");
        const state = String(value("State Abbreviation") || "");
        const district = String(value("District") || "").padStart(2, "0");
        const federalUrl = office === "U.S. House"
          ? `https://www.fec.gov/data/elections/house/${state}/${district}/2026/`
          : office === "U.S. Senate"
            ? `https://www.fec.gov/data/elections/senate/${state}/2026/`
            : data.source_url;
        renderCandidates(section);
          renderSourceStatus(
            section,
            finance?.status || (office === "Governor" ? "State disclosure system" : "FEC normalization pending"),
            finance?.reason || (office === "Governor"
              ? "Gubernatorial finance is state-regulated. A state disclosure connector has not yet normalized candidate receipts, spending, cash, debt, and outside spending for this race."
              : "The interface is ready for candidate receipts, spending, cash, debt, and independent-expenditure records; those FEC totals are not yet normalized in this race feed."),
            federalUrl,
            finance?.status || data.status,
            finance?.retrieved_at || data.retrieved_at
          );
      };

      const renderHistory = () => {
        const section = createSection("Election history");
        const historyBlock = data.history && typeof data.history === "object" ? data.history : {};
        const history = Array.isArray(historyBlock.series) ? historyBlock.series : (Array.isArray(data.history) ? data.history : []);
        if (history.length) {
          const list = section.createDiv({ cls: "election-race-dashboard__history-grid" });
          for (const race of history) {
            const row = list.createEl("article", { cls: "election-race-dashboard__history-card" });
            const margin = Number.isFinite(Number(race.dem_margin)) ? `D margin ${Number(race.dem_margin) >= 0 ? "+" : ""}${Number(race.dem_margin).toFixed(1)}` : "margin unavailable";
            const header = row.createDiv({ cls: "election-race-dashboard__history-card-header" });
            header.createEl("strong", { text: String(race.year || race.election || "Prior election") });
            header.createSpan({ text: [margin, race.contest_type || race.series].filter(Boolean).join(" · ") });
            const candidates = Array.isArray(race.candidates) ? race.candidates : [
              { name: race.winner, party: race.winner_party, vote_share: race.winner_share },
              { name: race.runner_up, party: race.runner_up_party, vote_share: race.runner_up_share }
            ].filter(candidate => candidate.name);
            const candidateGrid = row.createDiv({ cls: "election-race-dashboard__history-candidates" });
            for (const candidate of candidates.slice(0, 3)) {
              const candidateRow = candidateGrid.createDiv({ cls: `election-race-dashboard__history-candidate ${partyClass(candidate.party)}` });
              candidateRow.createSpan({ text: `${candidate.name || "Candidate"}${candidate.party ? ` (${candidate.party})` : ""}` });
              candidateRow.createEl("strong", { text: candidate.vote_share != null ? `${Number(candidate.vote_share).toFixed(1)}%` : "—" });
            }
            const shares = candidates.map(candidate => ({ ...candidate, share: Number(candidate.vote_share) })).filter(candidate => Number.isFinite(candidate.share));
            const dem = shares.filter(candidate => String(candidate.party).toUpperCase() === "D").reduce((sum, candidate) => sum + candidate.share, 0);
            const rep = shares.filter(candidate => String(candidate.party).toUpperCase() === "R").reduce((sum, candidate) => sum + candidate.share, 0);
            const other = Math.max(0, 100 - dem - rep);
            if (dem || rep) {
              const bar = row.createDiv({ cls: "election-race-dashboard__history-vote-bar", attr: { role: "img", "aria-label": `Democratic ${dem.toFixed(1)} percent, other candidates ${other.toFixed(1)} percent, Republican ${rep.toFixed(1)} percent` } });
              bar.createSpan({ cls: "is-dem", attr: { style: `width:${dem}%` } });
              bar.createSpan({ cls: "is-other", attr: { style: `width:${other}%` } });
              bar.createSpan({ cls: "is-rep", attr: { style: `width:${rep}%` } });
            }
            const footer = row.createDiv({ cls: "election-race-dashboard__history-card-footer" });
            footer.createSpan({ text: race.winner ? `Winner: ${race.winner}` : race.summary || race.result || "Result available" });
            addLinkOrText(footer, "source ↗", race.source_url || historyBlock.previous_contest?.url, "election-race-dashboard__record-link");
          }
          section.createEl("p", { text: `${history.length} historical result${history.length === 1 ? "" : "s"} · ${historyBlock.status || "source status unavailable"}`, cls: "election-race-dashboard__sync-note" });
        } else {
          const cards = section.createDiv({ cls: "election-race-dashboard__stats" });
          for (const [label, primary] of [
            ["Previous contest", data.previous_election?.name || historyBlock.previous_contest?.name || "Not normalized"],
            ["Incumbent before election", data.incumbent?.name || "Not normalized"]
          ]) {
            const card = cards.createEl("article", { cls: "election-race-dashboard__stat" });
            card.createSpan({ text: label });
            card.createEl("strong", { text: primary });
          }
        }
        const overview = section.createEl("p", { text: historyBlock.reason || data.overview || "No historical overview is available in the current normalized feed." });
        overview.addClass("election-race-dashboard__history-copy");
        addLinkOrText(section, "Open current race source ↗", data.source_url, "election-race-dashboard__source-link");
      };

      const render = mode => {
        panel.replaceChildren();
        for (const [key, button] of buttons) {
          const active = key === mode;
          button.toggleClass("is-active", active);
          button.setAttr("aria-selected", String(active));
          button.setAttr("tabindex", active ? "0" : "-1");
        }
        panel.setAttr("aria-labelledby", `${tabPrefix}-tab-${mode}`);
        if (mode === "trend") renderTrend();
        else if (mode === "polls") renderPolls();
        else if (mode === "finance") renderFinance();
        else if (mode === "history") renderHistory();
        else renderSnapshot();
      };

      for (const [key, label] of modes) {
        const button = controls.createEl("button", {
          text: label,
          attr: {
            id: `${tabPrefix}-tab-${key}`,
            type: "button",
            role: "tab",
            "aria-controls": `${tabPrefix}-panel`,
            "aria-selected": "false",
            tabindex: "-1"
          }
        });
        buttons.set(key, button);
        button.addEventListener("click", () => render(key));
        button.addEventListener("keydown", event => {
          const currentIndex = modes.findIndex(([mode]) => mode === key);
          let nextIndex = currentIndex;
          if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % modes.length;
          else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + modes.length) % modes.length;
          else if (event.key === "Home") nextIndex = 0;
          else if (event.key === "End") nextIndex = modes.length - 1;
          else return;
          event.preventDefault();
          const nextMode = modes[nextIndex][0];
          render(nextMode);
          buttons.get(nextMode)?.focus();
        });
      }
      render("trend");
    }
  }
}
