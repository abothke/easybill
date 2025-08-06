import axios from "axios";
import fs from "fs/promises";
import path from "path";

export class EasybillClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = "https://api.easybill.de/rest/v1";
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    });
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
      const initialResponse = await this.client.get("/documents", {
        params: {
          type: "INVOICE",
          limit: 100, // Nur 1 Item für Seiteninfo
          is_draft: 0, // Nur finale Rechnungen
        },
      });

      const totalPages = initialResponse.data.pages;
      const totalItems = initialResponse.data.total;
      console.log(
        `📋 Gesamt: ${totalItems} Rechnungen auf ${totalPages} Seiten, durchsuche die letzten 10 Seiten...`
      );

      // Berechne die letzten 10 Seiten (oder weniger wenn weniger als 10 vorhanden)
      const pagesToSearch = Math.min(10, totalPages);
      const startPage = Math.max(1, totalPages - pagesToSearch + 1);

      console.log(`🔍 Durchsuche Seiten ${startPage} bis ${totalPages}`);

      // Durchsuche die letzten Seiten von der neuesten zur ältesten
      for (let page = totalPages; page >= startPage; page--) {
        console.log(`📄 Durchsuche Seite ${page}...`);

        const response = await this.client.get("/documents", {
          params: {
            type: "INVOICE",
            limit: 100, // Standard Limit für gute Performance (250ms)
            page: page,
            is_draft: 0,
          },
        });

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
      const invoiceResponse = await this.client.get(`/documents/${invoiceId}`);
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
      const pdfResponse = await this.client.get(`/documents/${invoiceId}/pdf`, {
        responseType: "arraybuffer",
      });

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
      const response = await this.client.get("/customers", {
        params: { limit: 1 },
      });
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
