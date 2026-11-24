# Calendar Glass Card

Frosted-Glass Wochen-/Mehrtages-Agenda im Liquid-Glass-Stil für Home Assistant (`custom:calendar-glass-card`).
Zeigt einen oder mehrere `calendar`-Entities gruppiert nach Tag, mit Uhrzeit, Ort und einer farbigen
Legende pro Kalender. Design-Werte (Blur, Sättigung, Radien, Schatten, Farbpalette) sind auf die
Schwester-Karten (`thermostat-glass-card`, `weather-glass-card`, `saugroboter-card`) abgestimmt.

![demo](asset/calendar-glass-card.png)

## Features

- Gruppiert Termine nach Tag über einen konfigurierbaren Zeitraum (1–14 Tage)
- Mehrere Kalender gleichzeitig, jeweils mit eigener Farbe und Legenden-Eintrag
- **Legende ist klickbar:** Tippen auf einen Eintrag blendet diesen Kalender aus (Punkt graut aus,
  Termine verschwinden aus der Liste, Zähler unten passt sich an) — erneutes Tippen holt ihn zurück
- Heute-Hervorhebung mit eigenem Badge und Glow-Rahmen
- Ganztägige Termine, Ort-Anzeige, "jetzt laufend"-Hervorhebung
- Auto-Refresh in konfigurierbarem Intervall

## Installation

1. `calendar-glass-card.js` als Lovelace-Ressource hinzufügen:
   - Settings → Dashboards → ⋮ → Resources → Add Resource
   - URL: z.B. `/hacsfiles/calendar-glass-card/calendar-glass-card.js` (via HACS) oder
     `/local/calendar-glass-card.js` (Datei manuell nach `config/www/` kopieren)
   - Resource type: JavaScript Module

## Konfiguration

```yaml
type: custom:calendar-glass-card
title: Kalender
days: 7
entities:
  - entity: calendar.arbeit
    name: Arbeit
    color: indigo
  - entity: calendar.familie
    name: Familie
    color: teal
```

| Option | Typ | Default | Beschreibung |
|---|---|---|---|
| `entities` | list | *(erforderlich)* | Liste aus Kalender-Entity-IDs (String) oder Objekten `{entity, name, color}` |
| `title` | string | *(automatisch, z. B. "Heute und die nächsten 6 Tage")* | Card-Titel |
| `days` | number | `7` | Anzahl angezeigter Tage (1–14) |
| `week_start` | string | `today` | `today` = heute + die nächsten N-1 Tage (rollierendes Fenster), `monday` / `sunday` = feste Kalenderwoche |
| `show_empty_days` | boolean | `true` | Tage ohne Termine mit anzeigen |
| `show_location` | boolean | `true` | Ort unter dem Termin anzeigen |
| `show_legend` | boolean | `true` | Legende anzeigen (nur bei >1 Kalender) |
| `show_footer` | boolean | `true` | Fußzeile mit Gesamtzahl & Aktualisierungszeit |
| `highlight_today` | boolean | `true` | Heute farblich hervorheben |
| `free_label` | string | *(automatisch)* | Text bei `flat`, wenn im Zeitraum nichts ansteht |
| `flat` | boolean | `false` | Eine Fläche statt Kästen in der Karte: kein Rahmen um „Heute“, Termine als schlichte Zeilen mit Farbstrich, ganztägige Termine ohne „Ganztägig“-Spalte |
| `refresh_minutes` | number | `15` | Intervall für automatisches Neuladen der Termine |
| `look` | string | — (Theme, sonst glass) | `solid` = ruhige, feste Flächen statt Glas, `glass` erzwingt Glas, siehe *Solid look*. Ohne die Option (oder mit `theme`) folgt die Karte der Theme-Variable `lg-look`, sonst bleibt sie im Glas-Stil. Im visuellen Editor: „Stil: Vom Theme / Glas / Solide“ |
| `blur` | number | `20` | Blur-Radius (px) des Glass-Panels |
| `saturate` | number | `180` | Sättigung (%) des Glass-Panels |
| `panel_shade` | number | `6` | Helligkeit des Panel-Hintergrunds (-100 bis 100) |
| `tile_shade` | number | `9` | Helligkeit der Termin-Kacheln (-100 bis 100) |
| `locale` | string | *(HA-Locale)* | Locale für Datums-/Zeitformatierung |
| `all_day_label` / `today_label` / `empty_label` / `range_label` / `updated_label` | string | *(nach HA-Sprache)* | Eigene Texte statt der eingebauten. Ohne Angabe folgen alle Texte der Home-Assistant-Sprache: Deutsch bei `de`, sonst Englisch (seit 1.1.0) |

### Farben

`color` je Entity akzeptiert: `deep-orange`, `orange`, `teal`, `indigo`, `cyan`, `pink`, `green`,
`red`, `blue`, `purple`, `amber`, `yellow`, `brown`, `grey`/`gray`, oder einen Hex-Code (`#RRGGBB`).
Ohne Angabe wird aus `indigo, teal, amber, cyan, pink, green` rotiert.

## Solid look

`look: solid` ersetzt das Milchglas durch ruhige, feste Flächen – für Dashboards, die hinter den Karten
einen eigenen Hintergrund zeichnen (z. B. einen animierten Himmel). Aufbau, Tage, Gruppierung, Legende,
Kalenderfarben und alle Infos bleiben gleich; nur die Optik ändert sich:

- **Panel:** feste Fläche `--surface` (Standard: Kartenfarbe des Themes zu 88 %), feiner Rand,
  Radius `--lg-radius` (20 px), 16 px Innenabstand – kein Blur, kein Glanz, kein Schatten.
- **Termine:** feste Zeilen `--lg-tile-bg` (Standard: dezente Mischung der Textfarbe), Radius `--lg-radius` − 4 px,
  mindestens 44 px hoch. Der farbige Streifen und die Legenden-Punkte behalten die Kalenderfarbe, aber ohne Glow.
  Ein **gerade laufender** Termin ist mit seiner Kalenderfarbe getönt.
- **Heute:** ruhige Fläche mit „Heute“-Pille statt Leuchtrahmen.
- **Text:** Titel, Tage und Termine 15 px, Nebeninfos 13 px, Zeiten und Zähler mit gleich breiten Ziffern.
- `blur`, `saturate`, `panel_shade` und `tile_shade` wirken in diesem Stil nicht. Übergänge entfallen bei
  `prefers-reduced-motion`.

Die Karte liest nur die optionalen CSS-Variablen `--surface`, `--lg-tile-bg`, `--lg-radius`,
`--primary-text-color` und `--secondary-text-color`, sie setzt sie nie selbst.

Der Stil kann auch aus dem Theme kommen, für alle Liquid-Glass-Karten auf einmal: `lg-look: solid` (oder `glass`)
im Home-Assistant-Theme setzen. `look:` an einer einzelnen Karte überschreibt das Theme. Die Karte liest die Variable
neu, wenn sie eingehängt wird, wenn Theme oder Dunkelmodus in Home Assistant wechseln und beim Window-Event
`lg-theme-changed` (für Seiten, die die Variable selbst umschalten).

```yaml
# im Home-Assistant-Theme
lg-look: solid
```

```yaml
type: custom:calendar-glass-card
look: solid
entities:
  - entity: calendar.arbeit
    color: indigo
  - entity: calendar.familie
    color: teal
```

## Theme variables

Like the other Liquid Glass cards, this card reads optional CSS variables, so one theme can align all of them:

```yaml
# in your Home Assistant theme
lg-radius: 22px                          # corner radius of the glass panel
lg-backdrop: blur(22px) saturate(180%)   # blur/saturation behind the panel
lg-look: solid                           # solid or glass for all cards (see Solid look)
```

Without them nothing changes. Options set on the card itself (e.g. `blur`) still win.

## Changelog

### 1.3.1
- `flat`: Tageszeilen brechen in schmalen Spalten nicht mehr um. Stehen im ganzen Zeitraum keine Termine an, zeigt die Karte eine ruhige Zeile („Keine Termine in den nächsten 4 Tagen“, Text per `free_label` änderbar) statt leerer Tagesköpfe.

### 1.3.0
- Neue Option `flat: true`: keine Kästen mehr innerhalb der Karte. „Heute“ ist nur noch über das Badge markiert, Termine sind schlichte Zeilen mit Farbstrich, ganztägige Termine ohne „Ganztägig“-Spalte. Funktioniert mit Glas und Solid. Ohne die Option sieht die Karte aus wie bisher.

### 1.2.0
- Neue Option `look: solid`: ruhige, feste Flächen statt Glas – kein Blur, keine Verläufe oder Glows, feste Terminzeilen, laufender Termin in Kalenderfarbe getönt (siehe *Solid look*). Im visuellen Editor als „Stil: Glas / Solide“. Ohne die Option sieht die Karte aus wie bisher.
- Der Stil kann aus dem Theme kommen: `lg-look: solid` im Theme schaltet alle Karten ohne `look:` um; `look: glass` bzw. `look: solid` an der Karte überschreibt das (siehe *Solid look*). Im visuellen Editor neu: „Vom Theme“.

### 1.1.0
- Reads the optional theme variables `--lg-radius` and `--lg-backdrop` (see *Theme variables*).
- Texte ("Heute", "Termine", "Ganztägig", …) folgen der Home-Assistant-Sprache: Deutsch bei `de`, sonst Englisch. Die `*_label`-Optionen überschreiben weiterhin.
- Versions-Banner in der Browser-Konsole.

## License

MIT (analog zu den Schwester-Karten `liquid-glass-tile-card`, `liquid-lens-navbar-card`,
`thermostat-glass-card`).
