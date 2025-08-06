# Easybill Invoice Finder

Ein Node.js Tool zur Suche von Easybill-Rechnungen anhand der Bestellnummer.

## Features

🔍 **Intelligente Suche** - Findet Rechnungen über die Bestellnummer  
💾 **Smart Caching** - Speichert gefundene Rechnungen für 24h zwischen  
⬇️ **Auto-Download** - Lädt PDFs automatisch herunter  
🚀 **CLI Interface** - Einfache Kommandozeilen-Bedienung  
⚡ **API-optimiert** - Minimale API-Calls durch Caching

## Installation

1. **Dependencies installieren:**

```bash
npm install
```

2. **Umgebungsvariablen konfigurieren:**

```bash
cp .env.example .env
```

Dann `.env` bearbeiten:

```env
EASYBILL_API_KEY=dein_api_key
DOWNLOAD_PATH=./invoices
```

## Verwendung

### Rechnung nach Bestellnummer suchen

```bash
npm run find 12345
```

### Rechnung suchen und PDF herunterladen

```bash
npm run find 12345 --download
```

### Ohne Cache suchen

```bash
npm run find 12345 --no-cache
```

### PDF direkt über Rechnungs-ID herunterladen

```bash
node src/index.js download 987654
```

### Cache-Status prüfen

```bash
node src/index.js cache --status
```

### Cache löschen

```bash
node src/index.js cache --clear
```

### API-Verbindung testen

```bash
node src/index.js test
```

### Log-Verwaltung

```bash
# Die letzten 5 Ausführungen anzeigen
npm run logs

# Die letzten 10 Ausführungen anzeigen
node src/index.js logs --list 10

# Details einer spezifischen Ausführung
node src/index.js logs --details execution-2025-08-06_14-30-25.log
```

## Workflow für deine 10-15 Rechnungen/Tag

### Szenario 1: Einzelne Bestellung

```bash
npm run find ORDER-2025-08-001 --download
```

### Szenario 2: Batch-Verarbeitung

```bash
# Erstelle Batch-Script
node src/index.js find ORDER-001 --download
node src/index.js find ORDER-002 --download
node src/index.js find ORDER-003 --download
```

### Szenario 3: Mit PowerShell (Windows)

```powershell
$orders = @("ORDER-001", "ORDER-002", "ORDER-003")
foreach ($order in $orders) {
    node src/index.js find $order --download
}
```

## API-Effizienz

- ✅ **Smart Caching:** Bereits gefundene Rechnungen werden 24h gecacht
- ✅ **Batch-freundlich:** Bei 15 Rechnungen = max. 15 API Calls (statt 1000+ bei Vollsync)
- ✅ **Rate-Limit sicher:** Respektiert Easybill API Limits
- ✅ **Fehlerbehandlung:** Robuste Fehlerbehandlung und Logging

## Verzeichnisstruktur

```
easybill/
├── src/
│   ├── index.js              # CLI Interface
│   ├── easybill-client.js    # API Client
│   ├── cache-manager.js      # Cache-Verwaltung
│   └── logger.js             # Session-Logging
├── cache/                    # Cache-Dateien
├── invoices/                 # Heruntergeladene PDFs
├── logs/                     # Ausführungs-Logs
├── package.json
├── .env                      # Konfiguration
└── README.md
```

## Troubleshooting

### "API-Verbindung fehlgeschlagen"

- Prüfe API-Key in `.env`
- Teste mit: `node src/index.js test`

### "Rate Limit erreicht"

- Warte 1 Minute
- Nutze Cache: `node src/index.js cache --status`

### "Rechnung nicht gefunden"

- Prüfe Schreibweise der Bestellnummer
- Stelle sicher, dass die Rechnung in Easybill existiert
- Suche ohne Cache: `npm run find ORDER-123 --no-cache`
- Prüfe die Logs: `npm run logs`

### Debugging mit Logs

- **Letzte Ausführungen:** `npm run logs`
- **Detaillierte Fehleranalyse:** `node src/index.js logs --details <log-datei>`
- **Logs zeigen alle Schritte:** API-Calls, Cache-Hits, Fehler mit Stack-Traces

## Performance

- **Mit Cache:** Nur beim ersten Mal pro Rechnung
- **Download-Zeit:** ~2-5 Sekunden pro PDF
- **Speicherbedarf:** Minimal (nur kleine Cache-Datei)

Perfekt für deine Anforderungen! 🎯
