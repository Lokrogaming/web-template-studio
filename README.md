# SiteSmith

Desktop-Marketplace-App (Electron) + Website (GitHub Pages) für Website-Templates.

- **Templates:** liegen in [`Lokrogaming/web-templates`](https://github.com/Lokrogaming/web-templates) als `templates/*.zip` (je mit `.temp-config`) + `templates.json`-Mapping (Name ↔ Zip + `verified`-Flag, optional `preview`-Bild + `deploy`-Flags).
- **App:** browsen wie in einem Marketplace (Sidebar + Topbar mit Suche/GitHub-Menü), Card mit Preview-Bild, Stack-Badges (Mono), Deploy-Indikatoren und Buttons **Install Template** / **Preview** / **…**.
- Card → Modal *„Willst du diese Vorlage nutzen?“* mit zwei Buttons:
  - oben, enabled: **Per Workflow automatisieren (empfohlen)**
  - unten, muted: **.zip laden (Für Erfahrene)**
- **Detail-Panel (rechts):** großes Preview-Bild, alle Infos aus der Config (Art, Sprachen, Description, Version, Author, Latest updated), Installationsmethode, GitHub-Status.
- **Workflow:** prüft GitHub-Verknüpfung (falls nein → Anmeldung im Browser per OAuth-Web-Flow mit PKCE, Fallback: Token), Repo-Erstellung (frei umbenennbar) **inkl. auto-generiertem README mit Deploy-Anleitung**, bei HTML automatische Pages-Verknüpfung, Node.js/npm-Check (ggf. Auto-Install via winget), Preview (localhost, Anzeige per `webview`).
- **Installiert-Ansicht:** Verlauf der Workflow-Installationen (lokal) mit Ordner-/Repo-/Pages-/Preview-Aktionen.
- **Verified:** `verified: true` im Mapping → Icon auf Card + Detail-Panel.
- **Website:** `website/` (gespiegelt `docs/` für Pages-Legacy) – nur Infoseite + Installer-Download-Button, **aktuell deaktiviert**, bis die App fertig aufgesetzt ist.

## Entwickeln

```powershell
npm install
npm start
```

## Bauen (.exe Installer)

```powershell
npm run dist
# → release/SiteSmith Setup *.exe (+ portable)
```

Logo: finales Hammer-Logo folgt (derzeit geometrisches „S“-Platzhalter-Mark).

## Konfiguration

- Repo: `Lokrogaming/web-templates`, Branch `main`
- Mapping: `https://raw.githubusercontent.com/Lokrogaming/web-templates/main/templates.json`
- Zips: `https://raw.githubusercontent.com/Lokrogaming/web-templates/main/templates/<zip>`
- Previews: `https://raw.githubusercontent.com/Lokrogaming/web-templates/main/<preview>`
- Workspace lokal: `~/SiteSmith/<repo-name>`

## Sicherheit

GitHub-Token liegt in Electron-`userData/github.json`. Für Produktion auf `safeStorage` + Keychain umstellen (TODO).
