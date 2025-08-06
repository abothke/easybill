import { Command } from "commander";
import { config } from "dotenv";
import chalk from "chalk";
import ora from "ora";
import { EasybillClient } from "./easybill-client.js";
import { CacheManager } from "./cache-manager.js";

// Lade Umgebungsvariablen
config();

const program = new Command();
const cache = new CacheManager();

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
    const spinner = ora("Initialisiere...").start();

    try {
      // Validiere Umgebungsvariablen
      if (!process.env.EASYBILL_API_KEY) {
        spinner.fail("❌ EASYBILL_API_KEY muss in .env gesetzt sein");
        process.exit(1);
      }

      await cache.init();
      const client = new EasybillClient(process.env.EASYBILL_API_KEY);

      let invoice = null;

      // Prüfe Cache zuerst (wenn aktiviert)
      if (options.cache !== false) {
        spinner.text = "Suche im Cache...";
        invoice = await cache.getCachedInvoice(orderNumber);
      }

      // Falls nicht im Cache gefunden, suche über API
      if (!invoice) {
        spinner.text = "Suche über Easybill API...";
        invoice = await client.findInvoiceByOrderNumber(orderNumber);

        if (invoice && options.cache !== false) {
          await cache.cacheInvoice(orderNumber, invoice);
        }
      }

      if (invoice) {
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
            const filePath = await client.downloadInvoicePDF(
              invoice.id,
              process.env.DOWNLOAD_PATH
            );
            downloadSpinner.succeed(
              `✅ PDF gespeichert: ${chalk.green(filePath)}`
            );
          } catch (error) {
            downloadSpinner.fail(
              `❌ Download fehlgeschlagen: ${error.message}`
            );
          }
        } else {
          console.log(
            chalk.gray(
              "\n💡 Verwende --download oder -d um das PDF herunterzuladen"
            )
          );
        }
      } else {
        spinner.fail(
          `❌ Keine Rechnung für Bestellnummer '${orderNumber}' gefunden`
        );
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(`❌ Fehler: ${error.message}`);
      process.exit(1);
    }
  });

program
  .command("download")
  .description("Lade PDF einer bekannten Rechnung herunter")
  .argument("<invoice-id>", "Die Rechnungs-ID")
  .action(async (invoiceId) => {
    const spinner = ora("Lade PDF herunter...").start();

    try {
      if (!process.env.EASYBILL_API_KEY) {
        spinner.fail("❌ EASYBILL_API_KEY muss in .env gesetzt sein");
        process.exit(1);
      }

      const client = new EasybillClient(process.env.EASYBILL_API_KEY);
      const filePath = await client.downloadInvoicePDF(
        parseInt(invoiceId),
        process.env.DOWNLOAD_PATH
      );

      spinner.succeed(`✅ PDF gespeichert: ${chalk.green(filePath)}`);
    } catch (error) {
      spinner.fail(`❌ Download fehlgeschlagen: ${error.message}`);
      process.exit(1);
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
  .command("test")
  .description("Teste API-Verbindung")
  .action(async () => {
    const spinner = ora("Teste API-Verbindung...").start();

    try {
      if (!process.env.EASYBILL_API_KEY) {
        spinner.fail("❌ EASYBILL_API_KEY muss in .env gesetzt sein");
        process.exit(1);
      }

      const client = new EasybillClient(process.env.EASYBILL_API_KEY);
      const success = await client.testConnection();

      if (success) {
        spinner.succeed("✅ API-Verbindung erfolgreich");
      } else {
        spinner.fail("❌ API-Verbindung fehlgeschlagen");
        process.exit(1);
      }
    } catch (error) {
      spinner.fail(`❌ Fehler: ${error.message}`);
      process.exit(1);
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
