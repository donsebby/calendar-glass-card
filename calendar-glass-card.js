const CARD_VERSION = "1.3.0";
// eslint-disable-next-line no-console
console.info(`%c CALENDAR-GLASS-CARD %c v${CARD_VERSION} `, "color: white; background: #6366f1; font-weight: 700;", "color: #6366f1; background: white; font-weight: 700;");

// Style from the theme: `--lg-look` (solid | glass, quotes tolerated) decides
// for all Liquid Glass cards; `look:` in the card config overrides it.
const lgThemeLook = (el) => {
  let v = "";
  try {
    v = getComputedStyle(el).getPropertyValue("--lg-look") || "";
  } catch (err) {
    /* not rendered yet */
  }
  v = v.trim().replace(/^["']|["']$/g, "").trim().toLowerCase();
  return v === "solid" || v === "glass" ? v : "";
};

class CalendarGlassCard extends HTMLElement {
  setConfig(config) {
    if (!config.entities || !Array.isArray(config.entities) || !config.entities.length) {
      throw new Error("Please provide 'entities' as a list of calendar entity IDs.");
    }
    this._config = config;
    this._blur = config.blur ?? 20;
    this._saturate = config.saturate ?? 180;
    this._panelShade = config.panel_shade ?? 6;
    this._tileShade = config.tile_shade ?? 9;
    this._weekStart = config.week_start ?? "today";
    this._days = Math.max(1, Math.min(14, config.days ?? 7));
    this._showEmptyDays = config.show_empty_days !== false;
    this._showLocation = config.show_location !== false;
    this._showLegend = config.show_legend !== false;
    this._showFooter = config.show_footer !== false;
    this._highlightToday = config.highlight_today !== false;
    // flat: one surface only - no box around today, events as plain rows.
    this._flat = config.flat === true;
    this._refreshMinutes = config.refresh_minutes ?? 15;
    this._events = null;
    this._loading = true;
    this._error = null;
    this._hiddenEntities = this._hiddenEntities || new Set();
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = "";
    this._buildStyles();
    // look: solid is opt-in (card config or theme variable --lg-look);
    // anything else keeps the glass look untouched.
    this._look = this._effectiveLook();
    this._root.classList.toggle("solid", this._isSolid());
    if (this._hass) this._fetchEvents();
  }

  _isSolid() {
    return this._look === "solid";
  }

  _configLook() {
    const look = this._config?.look;
    return look === "solid" || look === "glass" ? look : "";
  }

  _effectiveLook() {
    return this._configLook() || lgThemeLook(this) || "glass";
  }

  // Re-read --lg-look (only when the card config has no `look`). If the
  // effective look changed, switch the class and redraw the event rows
  // (their colour stripes have no glow in the solid look).
  _checkLook() {
    if (!this._config || !this._root || this._configLook()) return;
    const look = this._effectiveLook();
    if (look === this._look) return;
    this._look = look;
    this._root.classList.toggle("solid", this._isSolid());
    this._render();
  }

  static getConfigForm() {
    return {
      schema: [
        { name: "title", selector: { text: {} } },
        { name: "days", selector: { number: { min: 1, max: 14, step: 1, mode: "slider" } } },
        { name: "week_start", selector: { select: { options: ["monday", "sunday", "today"] } } },
        { name: "show_empty_days", selector: { boolean: {} } },
        { name: "show_location", selector: { boolean: {} } },
        { name: "show_legend", selector: { boolean: {} } },
        { name: "flat", selector: { boolean: {} } },
        { name: "highlight_today", selector: { boolean: {} } },
        { name: "look", selector: { select: { mode: "dropdown", options: [{ value: "theme", label: "Vom Theme" }, { value: "glass", label: "Glas" }, { value: "solid", label: "Solide" }] } } },
        { name: "tile_shade", selector: { number: { min: -100, max: 100, step: 5, mode: "slider", unit_of_measurement: "%" } } },
        { name: "panel_shade", selector: { number: { min: -100, max: 100, step: 5, mode: "slider", unit_of_measurement: "%" } } },
      ],
      computeLabel: (s) => {
        switch (s.name) {
          case "title": return "Card title";
          case "days": return "Number of days";
          case "week_start": return "Range starts at";
          case "show_empty_days": return "Show days without events";
          case "show_location": return "Show location";
          case "show_legend": return "Show calendar legend";
          case "flat": return "Flat list (no boxes inside the card)";
          case "highlight_today": return "Highlight today";
          case "look": return "Stil";
          case "tile_shade": return "Event brightness";
          case "panel_shade": return "Panel brightness";
        }
        return s.name;
      },
      computeHelper: (s) => {
        switch (s.name) {
          case "week_start": return "monday / sunday = current calendar week, today = the next N days";
          case "look": return "Vom Theme = follows lg-look in the theme (glass without it); Solide = calm solid surfaces without blur or glow (blur, saturate and the brightness sliders then have no effect)";
          case "tile_shade": return "Negative = darker, positive = lighter (background of each event row)";
          case "panel_shade": return "Negative = darker, positive = lighter (background of the whole widget)";
        }
        return "";
      },
    };
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    if (!this._config) return;
    if (first) {
      this._fetchEvents();
      this._startTimer();
    }
    // Theme switched (or dark mode toggled): re-read --lg-look. Cheap
    // identity checks only - no getComputedStyle on every hass tick.
    const th = hass.themes;
    if (first || th !== this._themesRef || th?.theme !== this._themeName || th?.darkMode !== this._themeDark) {
      this._themesRef = th;
      this._themeName = th?.theme;
      this._themeDark = th?.darkMode;
      this._checkLook();
    }
    // Note: intentionally NOT re-rendering here. `hass` is set on every state
    // change anywhere in the house (often several times per second), and a
    // full innerHTML rebuild on each tick tears down/recreates the legend and
    // event DOM nodes constantly - which resets :hover mid-hover and makes
    // the legend names flicker. We just keep the latest `hass` reference
    // around; the next scheduled render (fetch timer or the lightweight
    // render-only timer below) picks it up.
  }

  connectedCallback() {
    if (this._config && this._hass) this._startTimer();
    if (!this._onThemeChanged) this._onThemeChanged = () => this._checkLook();
    window.addEventListener("lg-theme-changed", this._onThemeChanged);
    this._checkLook();
    // The theme may only apply after the card is attached.
    cancelAnimationFrame(this._lookFrame);
    this._lookFrame = requestAnimationFrame(() => this._checkLook());
  }

  disconnectedCallback() {
    cancelAnimationFrame(this._lookFrame);
    if (this._onThemeChanged) window.removeEventListener("lg-theme-changed", this._onThemeChanged);
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (this._renderTimer) clearInterval(this._renderTimer);
    this._renderTimer = null;
  }

  _startTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = setInterval(() => this._fetchEvents(), Math.max(1, this._refreshMinutes) * 60000);
    // Separate, low-frequency timer just to refresh time-sensitive visuals
    // (the "now" highlight, "Aktualisiert"-timestamp) without hammering the
    // DOM on every hass update.
    if (this._renderTimer) clearInterval(this._renderTimer);
    this._renderTimer = setInterval(() => {
      if (this._events) this._render();
    }, 60000);
  }

  getCardSize() {
    return this._days + 2;
  }

  static _shadeCss(value, maxWhite, maxBlack) {
    const v = Number(value) || 0;
    if (v >= 0) return "rgba(255,255,255," + ((v / 100) * maxWhite).toFixed(3) + ")";
    return "rgba(20,20,24," + ((Math.abs(v) / 100) * maxBlack).toFixed(3) + ")";
  }

  static _colorRgb(name) {
    const MAP = {
      "deep-orange": "226,131,90",
      "orange": "230,150,90",
      "teal": "77,182,172",
      "indigo": "124,137,209",
      "cyan": "79,195,217",
      "pink": "225,127,166",
      "green": "124,180,124",
      "red": "224,110,110",
      "blue": "100,150,220",
      "purple": "170,130,210",
      "amber": "224,180,100",
      "yellow": "220,200,110",
      "brown": "168,138,118",
      "grey": "158,164,172",
      "gray": "158,164,172"
    };
    if (!name) return null;
    if (MAP[name]) return MAP[name];
    const m = String(name).trim().match(/^#?([0-9a-fA-F]{6})$/);
    if (m) {
      const hex = m[1];
      return parseInt(hex.substring(0, 2), 16) + "," + parseInt(hex.substring(2, 4), 16) + "," + parseInt(hex.substring(4, 6), 16);
    }
    return null;
  }

  static _escape(str) {
    return String(str == null ? "" : str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // UI texts follow Home Assistant's language (German for "de*", English
  // otherwise); every one can still be overridden per card via the
  // existing *_label options.
  _t(key, n) {
    const lang = String(this._locale()).toLowerCase().startsWith("de") ? "de" : "en";
    const T = {
      de: {
        today: "Heute",
        todayAndNext: (k) => "Heute und die n\u00e4chsten " + k + " Tage",
        thisWeek: "Diese Woche",
        allDay: "Ganzt\u00e4gig",
        noEvents: "Keine Termine",
        events: (k) => k + (k === 1 ? " Termin" : " Termine"),
        inRange: "in diesem Zeitraum",
        updated: "Aktualisiert",
        noTitle: "(ohne Titel)",
        loading: "Termine werden geladen \u2026",
        loadError: "Kalender konnten nicht geladen werden: ",
      },
      en: {
        today: "Today",
        todayAndNext: (k) => "Today and the next " + k + " days",
        thisWeek: "This week",
        allDay: "All day",
        noEvents: "No events",
        events: (k) => k + (k === 1 ? " event" : " events"),
        inRange: "in this period",
        updated: "Updated",
        noTitle: "(no title)",
        loading: "Loading events \u2026",
        loadError: "Could not load calendars: ",
      },
    }[lang];
    const v = T[key];
    return typeof v === "function" ? v(n) : v;
  }

  _locale() {
    return this._config.locale || this._hass?.locale?.language || navigator.language || "de-DE";
  }

  _entityDefs() {
    const fallback = ["indigo", "teal", "amber", "cyan", "pink", "green"];
    return this._config.entities.map((item, i) => {
      const entity = typeof item === "string" ? item : item.entity;
      const cfgName = typeof item === "string" ? null : item.name;
      const color = (typeof item === "string" ? null : item.color) || fallback[i % fallback.length];
      const state = this._hass?.states?.[entity];
      return {
        entity,
        name: cfgName || state?.attributes?.friendly_name || entity,
        rgb: CalendarGlassCard._colorRgb(color) || "158,164,172",
      };
    });
  }

  _range() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (this._weekStart !== "today") {
      const dow = start.getDay();
      const offset = this._weekStart === "sunday" ? dow : (dow + 6) % 7;
      start.setDate(start.getDate() - offset);
    }
    const end = new Date(start);
    end.setDate(end.getDate() + this._days);
    return { start, end };
  }

  static _iso(d) {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
  }

  static _dayKey(d) {
    const p = (n) => String(n).padStart(2, "0");
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  async _fetchEvents() {
    if (!this._hass || !this._config) return;
    const { start, end } = this._range();
    const defs = this._entityDefs();
    try {
      const results = await Promise.all(defs.map(async (def) => {
        const path = "calendars/" + encodeURIComponent(def.entity) +
          "?start=" + encodeURIComponent(CalendarGlassCard._iso(start)) +
          "&end=" + encodeURIComponent(CalendarGlassCard._iso(end));
        try {
          const items = await this._hass.callApi("GET", path);
          return (items || []).map((ev) => ({ ev, def }));
        } catch (e) {
          return [];
        }
      }));
      this._events = results.flat().map(({ ev, def }) => {
        const allDay = !!(ev.start && ev.start.length === 10) || !!(ev.start && ev.start.date);
        const rawStart = ev.start?.dateTime || ev.start?.date || ev.start;
        const rawEnd = ev.end?.dateTime || ev.end?.date || ev.end;
        const startDate = allDay ? new Date(rawStart + "T00:00:00") : new Date(rawStart);
        const endDate = allDay ? new Date(rawEnd + "T00:00:00") : new Date(rawEnd);
        return {
          def,
          allDay,
          start: startDate,
          end: endDate,
          summary: ev.summary || this._t("noTitle"),
          location: ev.location || "",
          description: ev.description || "",
        };
      });
      this._loading = false;
      this._error = null;
    } catch (e) {
      this._loading = false;
      this._error = e?.message || String(e);
    }
    this._render();
  }

  _buildStyles() {
    const panelBg = CalendarGlassCard._shadeCss(this._panelShade, 0.3, 0.5);
    const tileBg = CalendarGlassCard._shadeCss(this._tileShade, 0.3, 0.5);
    // Card options win; otherwise a theme can set --lg-backdrop for all glass cards.
    const ownBackdrop = `blur(${this._blur}px) saturate(${this._saturate}%)`;
    const backdrop = this._config.blur != null || this._config.saturate != null ? ownBackdrop : `var(--lg-backdrop, ${ownBackdrop})`;
    const style = document.createElement("style");
    style.textContent = `
      :host { display:block; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
      .wrap {
        position:relative;
        padding:16px 16px 10px;
        border-radius:var(--lg-radius, 22px);
        background: ${panelBg};
        backdrop-filter: ${backdrop};
        -webkit-backdrop-filter: ${backdrop};
        border: 1px solid rgba(255,255,255,0.10);
        box-shadow: 0 20px 40px -20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10);
        overflow:hidden;
        color: var(--primary-text-color, #fff);
      }
      .sheen { position:absolute; inset:0; pointer-events:none; background:linear-gradient(155deg, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 28%, transparent 55%); }
      .head { position:relative; display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; padding:6px 6px 16px; }
      .head-l { display:flex; flex-direction:column; gap:3px; min-width:0; }
      .h-title { font-size:17px; font-weight:650; letter-spacing:-0.01em; }
      .h-sub { font-size:12.5px; color:var(--secondary-text-color, rgba(255,255,255,0.45)); }
      .legend { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
      .legend-item { display:flex; align-items:center; gap:6px; font-size:11.5px; color:var(--secondary-text-color, rgba(255,255,255,0.5)); cursor:pointer; user-select:none; -webkit-tap-highlight-color:transparent; transition:opacity .15s ease; }
      .legend-item:hover { opacity:0.75; }
      .legend-item.off { opacity:0.38; }
      .legend-item.off:hover { opacity:0.55; }
      .dot { width:7px; height:7px; border-radius:50%; transition:background .15s ease, box-shadow .15s ease; }
      .list { position:relative; display:flex; flex-direction:column; }
      .day-head { display:flex; align-items:center; gap:10px; padding:14px 6px 8px; }
      .day-head:first-child { padding-top:8px; }
      .day-name { display:flex; align-items:baseline; gap:7px; }
      .day-name b { font-size:13px; font-weight:650; }
      .day-name span { font-size:12px; color:var(--secondary-text-color, rgba(255,255,255,0.38)); }
      .rule { flex:1; height:1px; background:linear-gradient(90deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02)); }
      .count { font-size:11px; color:var(--secondary-text-color, rgba(255,255,255,0.3)); font-variant-numeric:tabular-nums; }
      .events { display:flex; flex-direction:column; gap:6px; }
      .today-block {
        position:relative; margin:14px -8px 0; padding:0 8px 12px;
        border-radius:20px;
        background: rgba(255,255,255,0.035);
        box-shadow: inset 0 0 0 1px rgba(124,196,255,0.14), 0 0 30px -6px rgba(120,180,255,0.18);
      }
      .today-block .day-head { padding-top:12px; }
      .badge-today {
        font-size:10px; font-weight:650; letter-spacing:0.09em; text-transform:uppercase;
        color:rgba(190,225,255,0.95); padding:3px 8px; border-radius:999px;
        background:rgba(140,195,255,0.14); border:1px solid rgba(160,205,255,0.28);
        box-shadow:0 0 14px -2px rgba(140,195,255,0.5); white-space:nowrap;
      }
      .ev {
        display:grid; grid-template-columns:3px 74px 1fr; align-items:start; gap:12px;
        padding:11px 14px 12px; border-radius:16px;
        background:${tileBg};
        border:1px solid rgba(255,255,255,0.07);
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.08);
        cursor:pointer; min-width:0;
      }
      .ev:hover { background: color-mix(in srgb, var(--primary-text-color, #fff) 9%, ${tileBg}); border-color:rgba(255,255,255,0.13); }
      .ev.allday { align-items:center; padding:10px 14px; }
      .ev.now { border-color:rgba(160,205,255,0.22); box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 0 20px -6px rgba(140,195,255,0.5); }
      .tint { width:3px; align-self:stretch; min-height:18px; border-radius:2px; }
      .time { display:flex; flex-direction:column; gap:2px; font-variant-numeric:tabular-nums; }
      .t1 { font-size:14px; font-weight:620; letter-spacing:-0.01em; }
      .t2 { font-size:12px; color:var(--secondary-text-color, rgba(255,255,255,0.38)); }
      .t-allday { font-size:11.5px; font-weight:600; letter-spacing:0.03em; color:var(--secondary-text-color, rgba(255,255,255,0.55)); }
      .body { display:flex; flex-direction:column; gap:5px; min-width:0; }
      .summary { font-size:14px; font-weight:560; line-height:1.3; text-wrap:pretty; overflow-wrap:anywhere; }
      .loc { font-size:12.5px; color:var(--secondary-text-color, rgba(255,255,255,0.5)); line-height:1.35; overflow-wrap:anywhere; }
      .empty { font-size:11px; color:var(--secondary-text-color, rgba(255,255,255,0.3)); }
      .foot {
        position:relative; display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
        margin-top:14px; padding:12px 8px 6px; border-top:1px solid rgba(255,255,255,0.06);
        font-size:11.5px; color:var(--secondary-text-color, rgba(255,255,255,0.35)); font-variant-numeric:tabular-nums;
      }
      .msg { padding:18px 8px; font-size:13px; color:var(--secondary-text-color, rgba(255,255,255,0.45)); }
      @media (max-width: 420px) {
        .ev { grid-template-columns:3px 62px 1fr; gap:10px; }
      }
      /* look: solid - calm solid surfaces instead of glass (opt-in, the
         glass rules above stay untouched). Same layout, days, grouping and
         calendar colours; no blur, sheen, gradients or glows. A running
         event is tinted with its calendar colour (--c, set in solid only). */
      .wrap.solid {
        --s-tile: var(--lg-tile-bg, color-mix(in srgb, var(--primary-text-color, #fff) 8%, transparent));
        padding:16px;
        border-radius:var(--lg-radius, 20px);
        background: var(--surface, color-mix(in srgb, var(--card-background-color, #1c1f28) 88%, transparent));
        backdrop-filter:none; -webkit-backdrop-filter:none;
        border:1px solid rgba(255,255,255,0.06);
        box-shadow:none;
      }
      .wrap.solid .sheen { display:none; }
      .wrap.solid .h-title { font-size:15px; font-weight:600; letter-spacing:0; }
      .wrap.solid .h-sub { font-size:13px; }
      .wrap.solid .legend-item { position:relative; font-size:13px; transition:opacity .2s ease; }
      .wrap.solid .legend-item::before { content:""; position:absolute; left:-6px; right:-6px; top:-14px; bottom:-14px; }
      .wrap.solid .dot { width:8px; height:8px; }
      .wrap.solid .day-name b { font-size:15px; font-weight:600; }
      .wrap.solid .day-name span { font-size:13px; }
      .wrap.solid .rule { background:rgba(255,255,255,0.06); }
      .wrap.solid .count, .wrap.solid .empty { font-size:13px; font-variant-numeric:tabular-nums; }
      .wrap.solid .today-block {
        border-radius:var(--lg-radius, 20px);
        background: color-mix(in srgb, var(--primary-text-color, #fff) 4%, transparent);
        box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
      }
      .wrap.solid .badge-today {
        font-size:12px; font-weight:600; letter-spacing:0.04em;
        color:var(--primary-text-color, #fff);
        background: color-mix(in srgb, var(--primary-text-color, #fff) 14%, transparent);
        border:none; box-shadow:none;
      }
      .wrap.solid .ev {
        box-sizing:border-box; min-height:44px;
        background:var(--s-tile);
        border:1px solid rgba(255,255,255,0.04);
        border-radius:calc(var(--lg-radius, 20px) - 4px);
        box-shadow:none;
        transition:background .2s ease;
      }
      .wrap.solid .ev:hover { background: color-mix(in srgb, var(--primary-text-color, #fff) 5%, var(--s-tile)); border-color:rgba(255,255,255,0.04); }
      .wrap.solid .ev.now, .wrap.solid .ev.now:hover {
        background: color-mix(in srgb, var(--c) 20%, var(--s-tile));
        border-color:rgba(255,255,255,0.04); box-shadow:none;
      }
      .wrap.solid .tint { box-shadow:none; }
      .wrap.solid .t1 { font-size:15px; font-weight:500; letter-spacing:0; }
      .wrap.solid .t2 { font-size:13px; }
      .wrap.solid .t-allday { font-size:13px; font-weight:500; letter-spacing:0; }
      .wrap.solid .summary { font-size:15px; font-weight:600; }
      .wrap.solid .loc { font-size:13px; }
      .wrap.solid .foot { font-size:13px; padding:12px 6px 0; }
      @media (prefers-reduced-motion: reduce) {
        .wrap.solid .ev, .wrap.solid .legend-item, .wrap.solid .dot { transition:none; }
      }
      /* flat: one surface only (opt-in). Today is marked by its badge, events
         are rows with the colour stripe - no boxes inside the card. */
      .wrap.flat .today-block, .wrap.flat.solid .today-block { margin:0; padding:0; background:none; box-shadow:none; border-radius:0; }
      .wrap.flat .today-block .day-head { padding-top:8px; }
      .wrap.flat .events { gap:2px; }
      .wrap.flat .ev, .wrap.flat.solid .ev {
        background:none; border:none; box-shadow:none; min-height:0;
        padding:8px 6px; border-radius:12px;
      }
      .wrap.flat .ev:hover, .wrap.flat.solid .ev:hover { background: color-mix(in srgb, var(--primary-text-color, #fff) 6%, transparent); }
      .wrap.flat .ev.now, .wrap.flat.solid .ev.now, .wrap.flat.solid .ev.now:hover { background: color-mix(in srgb, var(--c) 16%, transparent); box-shadow:none; }
      .wrap.flat .ev.allday { grid-template-columns:3px 1fr; padding:8px 6px; }
    `;
    this.shadowRoot.appendChild(style);
    this._root = document.createElement("div");
    this._root.className = "wrap";
    this._root.classList.toggle("flat", this._flat);
    this.shadowRoot.appendChild(this._root);
  }

  _moreInfo(entityId) {
    this.dispatchEvent(new CustomEvent("hass-more-info", { detail: { entityId }, bubbles: true, composed: true }));
  }

  _fmtTime(d) {
    return d.toLocaleTimeString(this._locale(), { hour: "2-digit", minute: "2-digit" });
  }

  _render() {
    if (!this._hass || !this._config || !this._root) return;
    const locale = this._locale();
    const { start } = this._range();
    const esc = CalendarGlassCard._escape;

    if (this._loading) {
      this._root.innerHTML = '<div class="sheen"></div><div class="msg">' + CalendarGlassCard._escape(this._t("loading")) + '</div>';
      return;
    }

    const now = new Date();
    const todayKey = CalendarGlassCard._dayKey(now);
    const days = [];
    for (let i = 0; i < this._days; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push({ date: d, key: CalendarGlassCard._dayKey(d), events: [] });
    }
    const byKey = {};
    days.forEach((d) => { byKey[d.key] = d; });

    const visibleEvents = (this._events || []).filter((ev) => !this._hiddenEntities.has(ev.def.entity));
    visibleEvents.forEach((ev) => {
      const cursor = new Date(ev.start.getFullYear(), ev.start.getMonth(), ev.start.getDate());
      const last = new Date(ev.end.getTime() - (ev.allDay ? 1 : 0));
      const lastDay = new Date(last.getFullYear(), last.getMonth(), last.getDate());
      let guard = 0;
      while (cursor <= lastDay && guard++ < 60) {
        const bucket = byKey[CalendarGlassCard._dayKey(cursor)];
        if (bucket) bucket.events.push(ev);
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    days.forEach((d) => d.events.sort((a, b) => (a.allDay === b.allDay ? a.start - b.start : (a.allDay ? -1 : 1))));

    const defs = this._entityDefs();
    const total = visibleEvents.length;
    const rangeLabel = days.length
      ? days[0].date.toLocaleDateString(locale, { day: "numeric", month: "long" }) + " " + String.fromCharCode(8211) + " " +
        days[days.length - 1].date.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" })
      : "";
    const defaultTitle = this._weekStart === "today"
      ? (this._days <= 1 ? this._t("today") : this._t("todayAndNext", this._days - 1))
      : this._t("thisWeek");

    // look: solid - no glows on the colour stripes and legend dots.
    const solid = this._isSolid();
    const evHtml = (ev) => {
      const isNow = !ev.allDay && ev.start <= now && ev.end > now;
      const timeCol = ev.allDay && this._flat
        ? ""
        : ev.allDay
        ? '<span class="t-allday">' + esc(this._config.all_day_label || this._t("allDay")) + "</span>"
        : '<div class="time"><span class="t1">' + esc(this._fmtTime(ev.start)) + '</span><span class="t2">' + esc(this._fmtTime(ev.end)) + "</span></div>";
      const loc = this._showLocation && ev.location ? '<span class="loc">' + esc(ev.location) + "</span>" : "";
      return '<div class="ev' + (ev.allDay ? " allday" : "") + (isNow ? " now" : "") + '" data-entity="' + esc(ev.def.entity) + '"' +
        (solid || this._flat ? ' style="--c:rgb(' + ev.def.rgb + ')"' : "") + ">" +
        '<div class="tint" style="background:rgb(' + ev.def.rgb + ');' + (solid ? "" : "box-shadow:0 0 10px rgba(" + ev.def.rgb + ",0.65);") + '"></div>' +
        timeCol +
        '<div class="body"><span class="summary">' + esc(ev.summary) + "</span>" + loc + "</div>" +
        "</div>";
    };

    const dayHtml = (d) => {
      const isToday = this._highlightToday && d.key === todayKey;
      if (!d.events.length && !this._showEmptyDays && !isToday) return "";
      const head = '<div class="day-head">' +
        '<div class="day-name"><b>' + esc(d.date.toLocaleDateString(locale, { weekday: "long" })) + "</b>" +
        "<span>" + esc(d.date.toLocaleDateString(locale, { day: "numeric", month: "long" })) + "</span></div>" +
        (isToday ? '<span class="badge-today">' + esc(this._config.today_label || this._t("today")) + "</span>" : "") +
        '<div class="rule"></div>' +
        (d.events.length
          ? '<span class="count">' + esc(this._t("events", d.events.length)) + "</span>"
          : '<span class="empty">' + esc(this._config.empty_label || this._t("noEvents")) + "</span>") +
        "</div>";
      const body = d.events.length ? '<div class="events">' + d.events.map(evHtml).join("") + "</div>" : "";
      return isToday
        ? '<div class="today-block">' + head + body + "</div>"
        : head + body;
    };

    this._root.innerHTML =
      '<div class="sheen"></div>' +
      '<div class="head"><div class="head-l">' +
        '<div class="h-title">' + esc(this._config.title || defaultTitle) + "</div>" +
        '<div class="h-sub">' + esc(rangeLabel) + "</div>" +
      "</div>" +
      (this._showLegend && defs.length > 1
        ? '<div class="legend">' + defs.map((def) => {
            const isHidden = this._hiddenEntities.has(def.entity);
            const dotStyle = isHidden
              ? "background:rgba(255,255,255,0.25);box-shadow:none;"
              : "background:rgb(" + def.rgb + ");" + (solid ? "" : "box-shadow:0 0 8px rgba(" + def.rgb + ",0.8);");
            return '<div class="legend-item' + (isHidden ? " off" : "") + '" data-entity="' + esc(def.entity) + '"><span class="dot" style="' + dotStyle + '"></span><span>' + esc(def.name) + "</span></div>";
          }).join("") + "</div>"
        : "") +
      "</div>" +
      '<div class="list">' + days.map(dayHtml).join("") + "</div>" +
      (this._error ? '<div class="msg">' + esc(this._t("loadError")) + esc(this._error) + "</div>" : "") +
      (this._showFooter
        ? '<div class="foot"><span>' + esc(this._t("events", total)) + " " + esc(this._config.range_label || this._t("inRange")) + "</span>" +
          "<span>" + esc(this._config.updated_label || this._t("updated")) + " " + esc(this._fmtTime(new Date())) + "</span></div>"
        : "");

    this._root.querySelectorAll(".ev[data-entity]").forEach((el) => {
      el.addEventListener("click", () => this._moreInfo(el.dataset.entity));
    });

    this._root.querySelectorAll(".legend-item[data-entity]").forEach((el) => {
      el.addEventListener("click", () => {
        const entity = el.dataset.entity;
        if (this._hiddenEntities.has(entity)) this._hiddenEntities.delete(entity);
        else this._hiddenEntities.add(entity);
        this._render();
      });
    });
  }
}

customElements.define("calendar-glass-card", CalendarGlassCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "calendar-glass-card",
  name: "Calendar Glass Card",
  description: "Frosted-glass weekly agenda: name, time and location of every event, grouped by day.",
});
