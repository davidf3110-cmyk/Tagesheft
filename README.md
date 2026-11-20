# Karriereplaner

Eine installierbare Web-App (PWA) zur persönlichen Karriereplanung – läuft auf Desktop und Smartphone, auch offline. Alle Daten bleiben lokal auf dem Gerät.

## Funktionen

- **Übersicht** – Weg von aktueller Rolle zur Zielrolle, Kennzahlen, anstehende Termine, größte Skill-Lücken
- **Vision** – Zielrolle, 5-Jahres-Vision, Werte und Stärken
- **Ziele** – nach Zeithorizont (kurz/mittel/lang), mit Meilensteinen, Fälligkeiten und Fortschritt
- **Skills** – Ist- vs. Zielniveau (1–5) mit Lernplan
- **Bewerbungen** – Kanban-Pipeline (Merkliste → Beworben → Interview → Angebot → Abgeschlossen) mit nächsten Schritten
- **Reflexion** – kurze Journal-Einträge mit Stimmung
- **Daten** – Export/Import als JSON, Zurücksetzen

## Entwicklung

```bash
npm install
npm run dev      # Entwicklungsserver
npm run build    # Produktions-Build nach dist/
npm run preview  # Build lokal ansehen
```

## Als App installieren

Den Inhalt von `dist/` auf einem beliebigen statischen Hosting (z. B. GitHub Pages, Netlify) veröffentlichen, die Seite im Browser öffnen und
„Zum Home-Bildschirm hinzufügen“ (iOS/Android) bzw. „App installieren“ (Chrome/Edge) wählen.

Tech: React 19, TypeScript, Vite. Speicherung über `localStorage`.
