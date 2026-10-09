# SiteSmith – Ideen & Roadmap

Sammlung für spätere Features. Status: Gedanke, noch nicht umgesetzt (außer wo noted).

## 1. Versionierung + verwandte Templates (TODO)

In `templates.json` bzw. `.temp-config` soll man **verwandte Projekte** angeben können:
Name, Pfad/ID und **Art der Verwandtschaft**.

Vorgeschlagenes Format (noch nicht final, bisher nur `versions[]` umgesetzt):

```json
{
  "id": "pages-landing",
  "related": [
    { "name": "Pages Landing Dark", "path": "templates/pages-landing-dark.zip", "relation": "theme" },
    { "name": "Pages Landing v2", "path": "templates/pages-landing-v2.zip", "relation": "version" }
  ]
}
```

Relationstypen (Vorschlag, erweiterbar):

| Typ | Bedeutung |
|---|---|
| `version` | Andere/neuere Version desselben Templates |
| `release` | Offizieller Release-Stand (z. B. stabil vs. beta) |
| `fix` | Gleiches Template mit Bugfix/Patch |
| `theme` | Nur Theme-/Farbänderung |
| `redesign` | Generell anderes Design bei gleichem Inhalt/Zweck |

Detailseite soll Verwandte als Liste/Karten zeigen („Auch verfügbar: … als Theme-Variante“).
Offen: Ob `path` (Zip-Pfad) oder `id` (Mapping-Referenz) besser ist – Tendenz: `id`, damit Umbenennungen nicht brechen.

## 2. UUIDs überall (teilweise DONE)

- [x] Jede Preview bekommt beim Ansehen eine UUID (`previewId`), Thumbnails heißen `<thumb-uuid>.png`.
- [x] Installierte Projekte haben `meta/meta.json` mit `projectId` + Preview-Mapping.
- [x] Template-Konfiguration (`config`-Schema + `{platzhalter}`) ist umgesetzt, inkl. späterem Ändern/Migrieren in den Project-Settings.
- [ ] Templates selbst bekommen stabile UUIDs (zusätzlich zu `id`), damit Screenshots/Thumbnails auch nach Umbenennung gemappt bleiben.
- [ ] Galerie-Einträge referenzieren Template-UUID statt Slug.

## 3. Galerie-Lightbox

Thumbnails auf der Detailseite klickbar machen (große Ansicht im Overlay).

## 4. Template-Vorschaubilder automatisieren

Screenshots aktuell manuell per Electron-Offscreen-Tool (`shotapp`-Prinzip). Idee: Capture beim Veröffentlichen neuer Template-Version automatisieren.

## 5. Mehr Marketplace-Funktionen

- Sortierung/Filter (Typ, Sprache, verifiziert), Bewertungen, Download-Zähler.
- „Zuletzt aktualisiert“-Badge bei frischen `updated`-Daten.
