import fs from "fs/promises";
import path from "path";

export class CacheManager {
  constructor(cacheDir = "./cache", cacheDurationHours = 24) {
    this.cacheDir = cacheDir;
    this.cacheDurationMs = cacheDurationHours * 60 * 60 * 1000;
    this.cacheFile = path.join(cacheDir, "invoice-cache.json");
  }

  /**
   * Initialisiere Cache-Verzeichnis
   */
  async init() {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
    } catch (error) {
      console.error(
        "Fehler beim Erstellen des Cache-Verzeichnisses:",
        error.message
      );
    }
  }

  /**
   * Lade Cache-Daten
   * @returns {Promise<Object>}
   */
  async loadCache() {
    try {
      const data = await fs.readFile(this.cacheFile, "utf8");
      const cache = JSON.parse(data);

      // Prüfe Alter der Cache-Daten
      const now = Date.now();
      if (cache.timestamp && now - cache.timestamp > this.cacheDurationMs) {
        console.log("🗑️ Cache ist veraltet, wird geleert");
        return { timestamp: now, invoices: {} };
      }

      return cache;
    } catch (error) {
      // Cache-Datei existiert nicht oder ist korrupt
      return { timestamp: Date.now(), invoices: {} };
    }
  }

  /**
   * Speichere Cache-Daten
   * @param {Object} cache
   */
  async saveCache(cache) {
    try {
      cache.timestamp = Date.now();
      await fs.writeFile(this.cacheFile, JSON.stringify(cache, null, 2));
    } catch (error) {
      console.error("Fehler beim Speichern des Caches:", error.message);
    }
  }

  /**
   * Suche Rechnung im Cache
   * @param {string} orderNumber
   * @returns {Promise<Object|null>}
   */
  async getCachedInvoice(orderNumber) {
    const cache = await this.loadCache();
    const cached = cache.invoices[orderNumber];

    if (cached) {
      console.log(
        `💾 Rechnung aus Cache: ${cached.number} für Bestellung ${orderNumber}`
      );
      return cached;
    }

    return null;
  }

  /**
   * Speichere Rechnung im Cache
   * @param {string} orderNumber
   * @param {Object} invoice
   */
  async cacheInvoice(orderNumber, invoice) {
    const cache = await this.loadCache();
    cache.invoices[orderNumber] = {
      id: invoice.id,
      number: invoice.number,
      order_number: invoice.order_number,
      created_at: invoice.created_at,
      cached_at: new Date().toISOString(),
    };
    await this.saveCache(cache);
    console.log(`💾 Rechnung ${invoice.number} im Cache gespeichert`);
  }

  /**
   * Cache-Status anzeigen
   */
  async showCacheStatus() {
    const cache = await this.loadCache();
    const cacheCount = Object.keys(cache.invoices).length;
    const cacheAge = cache.timestamp
      ? Math.round((Date.now() - cache.timestamp) / (1000 * 60 * 60))
      : 0;

    console.log(`📊 Cache Status:`);
    console.log(`   Einträge: ${cacheCount}`);
    console.log(`   Alter: ${cacheAge}h`);
    console.log(
      `   Gültig bis: ${
        cache.timestamp
          ? new Date(cache.timestamp + this.cacheDurationMs).toLocaleString(
              "de-DE"
            )
          : "unbekannt"
      }`
    );
  }

  /**
   * Cache löschen
   */
  async clearCache() {
    try {
      await fs.unlink(this.cacheFile);
      console.log("🗑️ Cache gelöscht");
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("Fehler beim Löschen des Caches:", error.message);
      }
    }
  }
}
