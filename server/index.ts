import { app } from "./app.js";
import { cleanupExpiredSessions } from "./auth.js";
import { prisma } from "./db.js";

// Mantém o listener somente no processo de desenvolvimento local.
const port = Number(process.env.API_PORT ?? 3001);
const sessionCleanupInterval = setInterval(() => {
  void cleanupExpiredSessions();
}, 60 * 60 * 1000);
sessionCleanupInterval.unref();
void cleanupExpiredSessions();

const server = app.listen(port, "127.0.0.1", () => {
  console.info(`API disponível em http://127.0.0.1:${port}`);
});

// Fecha o servidor e libera a conexão com o banco ao encerrar o processo.
async function shutdown() {
  clearInterval(sessionCleanupInterval);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
