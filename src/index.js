import { Command } from "commander";
import { config } from "dotenv";
import chalk from "chalk";
import ora from "ora";
import { EasybillClient } from "./easybill-client.js";
import { CacheManager } from "./cache-manager.js";
import { Logger } from "./logger.js";

// Lade Umgebungsvariablen
config();

const program = new Command();
const cache = new CacheManager();
const logger = new Logger();

program
  .name("easybill-invoice-finder")
  .description("Finde Easybill-Rechnungen anhand der Bestellnummer")
  .version("1.0.0");

program
  .command("find")
  .description("Finde Rechnung nach Bestellnummer")
  .argument("<order-number>", "Die Bestellnummer")
  .option("-d, --download", "PDF automatisch herunterladen")
  .option("--no-cache", "Cache nicht verwenden")
  .action(async (orderNumber, options) => {
    await logger.init();
    logger.setCommand("find", [
      orderNumber,
      ...Object.keys(options).filter((key) => options[key]),
    ]);

    const spinner = ora("Initialisiere...").start();

    try {
      // Validiere Umgebungsvariablen
      if (!process.env.EASYBILL_API_KEY) {
        const error = new Error("EASYBILL_API_KEY muss in .env gesetzt sein");
        logger.logError(error);
        await logger.finalize();
        spinner.fail("❌ EASYBILL_API_KEY muss in .env gesetzt sein");
        process.exit(1);
      }

      logger.logStep("Cache wird initialisiert");
      await cache.init();
      const client = new EasybillClient(process.env.EASYBILL_API_KEY, logger);

      let invoice = null;

      // Prüfe Cache zuerst (wenn aktiviert)
      if (options.cache !== false) {
        spinner.text = "Suche im Cache...";
        logger.logStep("Suche Rechnung im Cache", {
          orderNumber,
          cacheEnabled: true,
        });
        invoice = await cache.getCachedInvoice(orderNumber);

        if (invoice) {
          logger.logStep("Rechnung im Cache gefunden", {
            invoiceId: invoice.id,
            number: invoice.number,
          });
        }
      } else {
        logger.logStep("Cache deaktiviert", { cacheEnabled: false });
      }

      // Falls nicht im Cache gefunden, suche über API
      if (!invoice) {
        spinner.text = "Suche über Easybill API...";
        logger.logStep("Starte API-Suche", { orderNumber });
        invoice = await client.findInvoiceByOrderNumber(orderNumber);

        if (invoice && options.cache !== false) {
          logger.logStep("Rechnung wird im Cache gespeichert", {
            invoiceId: invoice.id,
          });
          await cache.cacheInvoice(orderNumber, invoice);
        }
      }

      if (invoice) {
        logger.logStep("Rechnung erfolgreich gefunden", {
          id: invoice.id,
          number: invoice.number,
          orderNumber: invoice.order_number,
        });

        spinner.succeed(`✅ Rechnung gefunden: ${chalk.green(invoice.number)}`);

        console.log(chalk.blue("\n📄 Rechnung Details:"));
        console.log(`   ID: ${invoice.id}`);
        console.log(`   Nummer: ${invoice.number}`);
        console.log(`   Bestellnummer: ${invoice.order_number}`);
        console.log(`   Erstellt: ${invoice.created_at || "unbekannt"}`);

        // Download wenn gewünscht
        if (options.download) {
          const downloadSpinner = ora("Lade PDF herunter...").start();
          try {
            logger.logStep("PDF-Download gestartet", { invoiceId: invoice.id });
            const filePath = await client.downloadInvoicePDF(
              invoice.id,
              process.env.DOWNLOAD_PATH
            );
            logger.logStep("PDF erfolgreich heruntergeladen", { filePath });
            downloadSpinner.succeed(
              `✅ PDF gespeichert: ${chalk.green(filePath)}`
            );
          } catch (error) {
            logger.logError(error, "PDF-Download");
            downloadSpinner.fail(
              `❌ Download fehlgeschlagen: ${error.message}`
            );
          }
        } else {
          logger.logStep("PDF-Download übersprungen (nicht angefordert)");
          console.log(
            chalk.gray(
              "\n💡 Verwende --download oder -d um das PDF herunterzuladen"
            )
          );
        }

        logger.setResult(true, {
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          downloaded: !!options.download,
        });
      } else {
        const error = new Error(
          `Keine Rechnung für Bestellnummer '${orderNumber}' gefunden`
        );
        logger.logError(error, "Suche");
        logger.setResult(false, { orderNumber });

        spinner.fail(
          `❌ Keine Rechnung für Bestellnummer '${orderNumber}' gefunden`
        );
        await logger.finalize();
        process.exit(1);
      }
    } catch (error) {
      logger.logError(error, "Hauptprozess");
      logger.setResult(false, { error: error.message });
      spinner.fail(`❌ Fehler: ${error.message}`);
      await logger.finalize();
      process.exit(1);
    } finally {
      await logger.finalize();
    }
  });

program
  .command("download")
  .description("Lade PDF einer bekannten Rechnung herunter")
  .argument("<invoice-id>", "Die Rechnungs-ID")
  .action(async (invoiceId) => {
    await logger.init();
    logger.setCommand("download", [invoiceId]);

    const spinner = ora("Lade PDF herunter...").start();

    try {
      if (!process.env.EASYBILL_API_KEY) {
        const error = new Error("EASYBILL_API_KEY muss in .env gesetzt sein");
        logger.logError(error);
        await logger.finalize();
        spinner.fail("❌ EASYBILL_API_KEY muss in .env gesetzt sein");
        process.exit(1);
      }

      logger.logStep("PDF-Download gestartet", { invoiceId });
      const client = new EasybillClient(process.env.EASYBILL_API_KEY, logger);
      const filePath = await client.downloadInvoicePDF(
        parseInt(invoiceId),
        process.env.DOWNLOAD_PATH
      );

      logger.logStep("PDF erfolgreich heruntergeladen", { filePath });
      logger.setResult(true, { filePath });
      spinner.succeed(`✅ PDF gespeichert: ${chalk.green(filePath)}`);
    } catch (error) {
      logger.logError(error, "PDF-Download");
      logger.setResult(false, { error: error.message });
      spinner.fail(`❌ Download fehlgeschlagen: ${error.message}`);
      await logger.finalize();
      process.exit(1);
    } finally {
      await logger.finalize();
    }
  });

program
  .command("cache")
  .description("Cache-Verwaltung")
  .option("-s, --status", "Cache-Status anzeigen")
  .option("-c, --clear", "Cache löschen")
  .action(async (options) => {
    await cache.init();

    if (options.clear) {
      await cache.clearCache();
    } else if (options.status) {
      await cache.showCacheStatus();
    } else {
      console.log("Verwende --status oder --clear");
    }
  });

program
  .command("logs")
  .description("Log-Verwaltung")
  .option("-l, --list [count]", "Zeige die letzten Logs an (Standard: 5)", "5")
  .option("-d, --details <filename>", "Zeige Details eines spezifischen Logs")
  .action(async (options) => {
    await logger.init();

    if (options.details) {
      await logger.showLogDetails(options.details);
    } else {
      const count = parseInt(options.list) || 5;
      await logger.showRecentLogs(count);
    }
  });

program
  .command("test")
  .description("Teste API-Verbindung")
  .action(async (options) => {
    await logger.init();
    logger.setCommand("test");

    const spinner = ora("Teste API-Verbindung...").start();

    try {
      if (!process.env.EASYBILL_API_KEY) {
        const error = new Error("EASYBILL_API_KEY muss in .env gesetzt sein");
        logger.logError(error);
        await logger.finalize();
        spinner.fail("❌ EASYBILL_API_KEY muss in .env gesetzt sein");
        process.exit(1);
      }

      logger.logStep("API-Verbindungstest gestartet");
      const client = new EasybillClient(process.env.EASYBILL_API_KEY, logger);
      const success = await client.testConnection();

      if (success) {
        logger.logStep("API-Verbindung erfolgreich");
        logger.setResult(true, { connection: "successful" });
        spinner.succeed("✅ API-Verbindung erfolgreich");
      } else {
        const error = new Error("API-Verbindung fehlgeschlagen");
        logger.logError(error);
        logger.setResult(false, { connection: "failed" });
        spinner.fail("❌ API-Verbindung fehlgeschlagen");
        await logger.finalize();
        process.exit(1);
      }
    } catch (error) {
      logger.logError(error, "API-Test");
      logger.setResult(false, { error: error.message });
      spinner.fail(`❌ Fehler: ${error.message}`);
      await logger.finalize();
      process.exit(1);
    } finally {
      await logger.finalize();
    }
  });

// Hilfe bei unbekannten Befehlen
program.on("command:*", () => {
  console.error(chalk.red(`❌ Unbekannter Befehl: ${program.args.join(" ")}`));
  console.log(chalk.yellow("💡 Verwende --help für verfügbare Befehle"));
  process.exit(1);
});

// Parse Argumente
program.parse();
