import axios from "axios";
import fs from "fs/promises";
import path from "path";

export class EasybillClient {
  constructor(apiKey, logger = null) {
    this.apiKey = apiKey;
    this.baseURL = "https://api.easybill.de/rest/v1";
    this.logger = logger;
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  /**
   * Warte bei Rate-Limit Fehlern
   * @param {number} seconds - Anzahl Sekunden zu warten
   */
  async waitForRateLimit(seconds = 6) {
    console.log(`⏳ Rate-Limit erreicht, warte ${seconds} Sekunden...`);
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  /**
   * API-Request mit Rate-Limit Handling
   * @param {Function} requestFn - Die Request-Funktion
   * @param {number} maxRetries - Maximale Anzahl Wiederholungen
   * @returns {Promise} Response
   */
  async apiRequestWithRetry(requestFn, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        if (error.response?.status === 429 && attempt < maxRetries) {
          if (this.logger) {
            this.logger.logRateLimit(attempt, maxRetries, 6);
          }
          console.log(
            `💥 Rate-Limit Fehler (Versuch ${attempt}/${maxRetries})`
          );
          await this.waitForRateLimit(6);
          console.log(`🔄 Wiederhole Request...`);
          continue;
        }
        throw error;
      }
    }
  }

  /**
   * Suche Rechnung nach Bestellnummer
   * @param {string} orderNumber - Die Bestellnummer
   * @returns {Promise<Object|null>} Rechnung oder null wenn nicht gefunden
   */
  async findInvoiceByOrderNumber(orderNumber) {
    try {
      console.log(`🔍 Suche Rechnung für Bestellnummer: ${orderNumber}`);

      // Erste Anfrage mit limit=1 um nur die Gesamtzahl der Seiten zu ermitteln
      console.log(`📊 Ermittle Gesamtzahl der Seiten...`);
      const initialResponse = await this.apiRequestWithRetry(() =>
        this.client.get("/documents", {
          params: {
            type: "INVOICE",
            limit: 100,
            is_draft: 0,
          },
        })
      );

      const totalPages = initialResponse.data.pages;
      const totalItems = initialResponse.data.total;
      console.log(
        `📋 Gesamt: ${totalItems} Rechnungen auf ${totalPages} Seiten, durchsuche die letzten 10 Seiten...`
      );

      // Berechne die letzten 10 Seiten (oder weniger wenn weniger als 10 vorhanden)
      const pagesToSearch = Math.min(20, totalPages);
      const startPage = Math.max(1, totalPages - pagesToSearch + 1);

      console.log(`🔍 Durchsuche Seiten ${startPage} bis ${totalPages}`);

      // Durchsuche die letzten Seiten von der neuesten zur ältesten
      for (let page = totalPages; page >= startPage; page--) {
        console.log(`📄 Durchsuche Seite ${page}...`);

        const response = await this.apiRequestWithRetry(() =>
          this.client.get("/documents", {
            params: {
              type: "INVOICE",
              limit: 100,
              page: page,
              is_draft: 0,
            },
          })
        );

        const invoices = response.data.items || [];

        // Suche nach order_number - berücksichtige verschiedene Formate
        const foundInvoice = invoices.find((invoice) => {
          if (!invoice.order_number) return false;

          const invoiceOrderNumber = invoice.order_number.trim();
          const searchOrderNumber = orderNumber.trim();

          // Exakte Übereinstimmung
          if (invoiceOrderNumber === searchOrderNumber) return true;

          // Suche mit # am Anfang
          if (invoiceOrderNumber === `#${searchOrderNumber}`) return true;

          // Suche ohne # wenn vorhanden
          if (
            invoiceOrderNumber.startsWith("#") &&
            invoiceOrderNumber.substring(1) === searchOrderNumber
          )
            return true;

          return false;
        });

        if (foundInvoice) {
          console.log(
            `✅ Rechnung gefunden auf Seite ${page}: ${foundInvoice.number} (ID: ${foundInvoice.id})`
          );
          return foundInvoice;
        }
      }

      console.log(
        `❌ Keine Rechnung für Bestellnummer '${orderNumber}' in den letzten ${pagesToSearch} Seiten gefunden`
      );
      return null;
    } catch (error) {
      console.error(
        "❌ Fehler beim Suchen der Rechnung:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Lade Rechnung als PDF herunter
   * @param {number} invoiceId - Die Rechnungs-ID
   * @param {string} downloadPath - Pfad zum Speichern
   * @returns {Promise<string>} Pfad zur heruntergeladenen Datei
   */
  async downloadInvoicePDF(invoiceId, downloadPath = "./invoices") {
    try {
      // Erstelle Download-Ordner falls nicht vorhanden
      await fs.mkdir(downloadPath, { recursive: true });

      // Hole Rechnung Details für Dateinamen
      const invoiceResponse = await this.apiRequestWithRetry(() =>
        this.client.get(`/documents/${invoiceId}`)
      );
      const invoice = invoiceResponse.data;
      const fileName = `${invoice.order_number}.pdf`;
      const filePath = path.join(downloadPath, fileName);

      // Prüfe ob Datei bereits existiert
      try {
        await fs.access(filePath);
        console.log(`📄 PDF bereits vorhanden: ${filePath}`);
        return filePath;
      } catch {
        // Datei existiert nicht, lade herunter
      }

      // Lade PDF herunter
      console.log(`⬇️ Lade PDF herunter: ${fileName}`);
      const pdfResponse = await this.apiRequestWithRetry(() =>
        this.client.get(`/documents/${invoiceId}/pdf`, {
          responseType: "arraybuffer",
        })
      );

      // Speichere PDF
      await fs.writeFile(filePath, pdfResponse.data);
      console.log(`✅ PDF gespeichert: ${filePath}`);

      return filePath;
    } catch (error) {
      console.error(
        "❌ Fehler beim Download der Rechnung:",
        error.response?.data || error.message
      );
      throw error;
    }
  }

  /**
   * Teste API-Verbindung
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      const response = await this.apiRequestWithRetry(() =>
        this.client.get("/customers", {
          params: { limit: 1 },
        })
      );
      console.log("✅ API-Verbindung erfolgreich");
      return true;
    } catch (error) {
      console.error(
        "❌ API-Verbindung fehlgeschlagen:",
        error.response?.data || error.message
      );
      return false;
    }
  }
}
