# SiteSmith

Desktop-Marketplace-App (Electron) + Website (GitHub Pages) für Website-Templates.

- **Templates:** liegen in [`Lokrogaming/web-templates`](https://github.com/Lokrogaming/web-templates) als `templates/*.zip` (je mit `.temp-config`) + `templates.json`-Mapping (Name ↔ Zip + `verified`-Flag, optional `preview`-Bild + `deploy`-Flags).
- **App:** browsen wie in einem Marketplace (Sidebar + Topbar mit Suche/GitHub-Menü), Card mit Preview-Bild, Stack-Badges (Mono), Deploy-Indikatoren und Buttons **Install Template** / **Preview** / Details. Icons: Lucide (vendored, `npm run vendor:icons` aktualisiert sie).
- **Install-Dialog (erst nach Klick auf Installieren):** Konfiguration mit Repository-Name, Zielordner (wählbar) und Optionen (GitHub-Repo, Pages, README). Templates mit `config`-Schema zeigen danach ein Formular (z. B. Name, E-Mail) – `{platzhalter}` werden vor der Repo-Erstellung ersetzt. GitHub-Anmeldung und Node-Setup erscheinen nur kontextabhängig, wenn sie wirklich gebraucht werden. Danach Live-Fortschritt pro Schritt, am Ende Ergebnis mit nächsten Aktionen. Abbruch jederzeit möglich, Buttons sind während laufender Vorgänge gesperrt.
- **Project-Settings (Tab Installiert → Einstellungen):** Beschreibung per Textarea ändern (Save committet + pusht automatisch), Konfiguration später ändern bzw. auf neue Template-Versionen migrieren, Danger Zone mit 3 Stufen (nur lokal löschen / nur GitHub-Repo löschen mit Namen-Bestätigung / ganz löschen). Remote-Löschen braucht `delete_repo`-Scope (einmal neu anmelden).
- **Node.js/npm:** Beim Erststart geprüft. Fehlt Node (min. v20), bietet SiteSmith ein Setup mit Fortschritt an: offizielles LTS-Zip von nodejs.org, lokal nach Electron-userData entpackt (kein Admin, kein PATH-Eingriff). Vorhandene Installationen werden wiederverwendet. Node-Templates sind bis dahin gesperrt.
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

## Testen

```powershell
npm test            # Renderer-Flows (jsdom) + Node-Setup (Reuse-Modus)
npm run test:node-full   # zusätzlich echter nodejs.org-Download/Extract/Verify (Windows)
npm run pack        # Paketier-Test (release/win-unpacked)
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
