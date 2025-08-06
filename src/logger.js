import fs from "fs/promises";
import path from "path";

export class Logger {
  constructor(logDir = "./logs", maxLogFiles = 10) {
    this.logDir = logDir;
    this.maxLogFiles = maxLogFiles;
    this.logFile = path.join(logDir, `execution-${this.getDateString()}.log`);
    this.session = {
      startTime: new Date().toISOString(),
      command: null,
      steps: [],
      errors: [],
      result: null,
      endTime: null,
    };
  }

  /**
   * Initialisiere Logging
   */
  async init() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (error) {
      console.error(
        "Fehler beim Erstellen des Log-Verzeichnisses:",
        error.message
      );
    }
  }

  /**
   * Setze den ausgeführten Befehl
   */
  setCommand(command, args = []) {
    this.session.command = {
      name: command,
      args: args,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Logge einen Schritt
   */
  logStep(message, data = null) {
    const step = {
      timestamp: new Date().toISOString(),
      message,
      data,
    };
    this.session.steps.push(step);
    console.log(`📝 ${message}`);
  }

  /**
   * Logge Rate-Limit Ereignis
   */
  logRateLimit(attempt, maxRetries, waitSeconds = 6) {
    const rateLimitEvent = {
      timestamp: new Date().toISOString(),
      message: `Rate-Limit erreicht (Versuch ${attempt}/${maxRetries})`,
      data: {
        attempt,
        maxRetries,
        waitSeconds,
        type: "rate_limit",
      },
    };
    this.session.steps.push(rateLimitEvent);
    console.log(`⏳ ${rateLimitEvent.message} - warte ${waitSeconds}s`);
  }

  /**
   * Logge einen Fehler
   */
  logError(error, context = null) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack,
      context: context,
    };
    this.session.errors.push(errorEntry);
    console.error(`❌ ${error.message}`);
  }

  /**
   * Setze das Ergebnis
   */
  setResult(success, data = null) {
    this.session.result = {
      success: success,
      data: data,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Beende die Session und speichere das Log
   */
  async finalize() {
    this.session.endTime = new Date().toISOString();
    this.session.duration =
      new Date(this.session.endTime) - new Date(this.session.startTime);

    await this.writeLog();
    await this.cleanupOldLogs();
  }

  /**
   * Schreibe Log in Datei
   */
  async writeLog() {
    try {
      const logContent = JSON.stringify(this.session, null, 2);
      await fs.writeFile(this.logFile, logContent);
      console.log(`📋 Session-Log gespeichert: ${this.logFile}`);
    } catch (error) {
      console.error("Fehler beim Schreiben des Logs:", error.message);
    }
  }

  /**
   * Zeige die letzten Logs an
   */
  async showRecentLogs(count = 5) {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files
        .filter(
          (file) => file.startsWith("execution-") && file.endsWith(".log")
        )
        .sort()
        .reverse()
        .slice(0, count);

      console.log(`📋 Die letzten ${logFiles.length} Ausführungen:\n`);

      for (const file of logFiles) {
        const content = await fs.readFile(path.join(this.logDir, file), "utf8");
        const log = JSON.parse(content);

        const duration = log.duration
          ? `${Math.round(log.duration / 1000)}s`
          : "unbekannt";
        const success = log.result?.success ? "✅" : "❌";

        console.log(`${success} ${file}`);
        console.log(
          `   Befehl: ${log.command?.name} ${
            log.command?.args?.join(" ") || ""
          }`
        );
        console.log(`   Dauer: ${duration}`);
        console.log(`   Schritte: ${log.steps.length}`);
        console.log(`   Fehler: ${log.errors.length}`);

        if (log.result?.data) {
          console.log(`   Ergebnis: ${JSON.stringify(log.result.data)}`);
        }

        console.log("");
      }
    } catch (error) {
      console.error("Fehler beim Anzeigen der Logs:", error.message);
    }
  }

  /**
   * Zeige Details eines spezifischen Logs
   */
  async showLogDetails(filename) {
    try {
      const logPath = path.join(this.logDir, filename);
      const content = await fs.readFile(logPath, "utf8");
      const log = JSON.parse(content);

      console.log(`📋 Log-Details: ${filename}\n`);
      console.log(
        `🕐 Gestartet: ${new Date(log.startTime).toLocaleString("de-DE")}`
      );
      console.log(
        `🕐 Beendet: ${
          log.endTime
            ? new Date(log.endTime).toLocaleString("de-DE")
            : "läuft noch"
        }`
      );
      console.log(
        `⏱️ Dauer: ${
          log.duration ? Math.round(log.duration / 1000) + "s" : "unbekannt"
        }`
      );

      if (log.command) {
        console.log(`\n💻 Befehl:`);
        console.log(
          `   ${log.command.name} ${log.command.args?.join(" ") || ""}`
        );
      }

      if (log.steps.length > 0) {
        console.log(`\n📝 Schritte (${log.steps.length}):`);
        log.steps.forEach((step, index) => {
          const time = new Date(step.timestamp).toLocaleTimeString("de-DE");
          console.log(`   ${index + 1}. [${time}] ${step.message}`);
          if (step.data) {
            console.log(`      Data: ${JSON.stringify(step.data)}`);
          }
        });
      }

      if (log.errors.length > 0) {
        console.log(`\n❌ Fehler (${log.errors.length}):`);
        log.errors.forEach((error, index) => {
          const time = new Date(error.timestamp).toLocaleTimeString("de-DE");
          console.log(`   ${index + 1}. [${time}] ${error.error}`);
          if (error.context) {
            console.log(`      Kontext: ${error.context}`);
          }
        });
      }

      if (log.result) {
        console.log(`\n🎯 Ergebnis:`);
        console.log(`   Erfolgreich: ${log.result.success ? "✅" : "❌"}`);
        if (log.result.data) {
          console.log(`   Daten: ${JSON.stringify(log.result.data, null, 2)}`);
        }
      }
    } catch (error) {
      console.error("Fehler beim Anzeigen der Log-Details:", error.message);
    }
  }

  /**
   * Lösche alte Log-Dateien
   */
  async cleanupOldLogs() {
    try {
      const files = await fs.readdir(this.logDir);
      const logFiles = files
        .filter(
          (file) => file.startsWith("execution-") && file.endsWith(".log")
        )
        .sort();

      if (logFiles.length > this.maxLogFiles) {
        const toDelete = logFiles.slice(0, logFiles.length - this.maxLogFiles);
        for (const file of toDelete) {
          await fs.unlink(path.join(this.logDir, file));
        }
        console.log(`🗑️ ${toDelete.length} alte Log-Datei(en) gelöscht`);
      }
    } catch (error) {
      console.error("Fehler beim Aufräumen alter Logs:", error.message);
    }
  }

  /**
   * Erstelle Datumsstring für Dateinamen
   */
  getDateString() {
    const now = new Date();
    return (
      now.toISOString().split("T")[0] +
      "_" +
      now.toTimeString().split(" ")[0].replace(/:/g, "-")
    );
  }
}
