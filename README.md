# Web Template Studio

Desktop-Marketplace-App (Electron) + Website (GitHub Pages) für Website-Templates.

- **Templates:** liegen in [`Lokrogaming/web-templates`](https://github.com/Lokrogaming/web-templates) als `templates/*.zip` (je mit `.temp-config`) + `templates.json`-Mapping (Name ↔ Zip + `verified`-Flag).
- **App:** browsen wie in einem Marketplace, Card → Modal *„Willst du diese Vorlage nutzen?“* mit zwei Buttons:
  - oben, enabled: **Per Workflow automatisieren (empfohlen)**
  - unten, muted: **.zip laden (Für Erfahrene)**
- **Detailseiten:** per **Mehr / …** – zeigt alle Infos aus der Config (Art, Sprachen, Description, Version, Author, Latest updated) + Deploy-Anleitung.
- **Workflow:** prüft GitHub-Verknüpfung (falls nein → Anmeldung per Token), Repo-Erstellung (per Modal umbenennbar), bei HTML automatische Pages-Verknüpfung, Node.js/npm-Check (ggf. Auto-Install via winget), Preview (statischer localhost-Server, Anzeige per `webview`).
- **Verified:** `verified: true` im Mapping → Icon auf Card + Detailseite.
- **Website:** `website/` (wird per Pages gehostet) – nur Infoseite + Installer-Download-Button, **aktuell deaktiviert**, bis die App ordentlich aufgesetzt ist.

## Entwickeln

```powershell
cd web-template-studio
npm install
npm start
```

## Bauen (.exe Installer)

```powershell
npm run dist
# → release/Web Template Studio Setup *.exe (+ portable)
```

Icon: `assets/icon.ico` vor dem Bauen ablegen (derzeit Platzhalter-Pfad in package.json).

## Konfiguration

- Repo: `Lokrogaming/web-templates`, Branch `main`
- Mapping: `https://raw.githubusercontent.com/Lokrogaming/web-templates/main/templates.json`
- Zips: `https://raw.githubusercontent.com/Lokrogaming/web-templates/main/templates/<zip>`
- Workspace lokal: `~/WebTemplateStudio/<repo-name>`

## Sicherheit

GitHub-Token liegt in Electron-`userData/github.json`. Für Produktion auf `safeStorage` + Keychain umstellen (TODO).
