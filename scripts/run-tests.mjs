import "dotenv/config";
import { spawnSync } from "node:child_process";

// Executa banco e Vitest em um banco Postgres exclusivo, nunca contra produção.
function fail(message) {
  console.error(message);
  process.exit(1);
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  fail(
    "Defina TEST_DATABASE_URL com a URL de um banco Postgres exclusivo para testes.",
  );
}
if (!/^postgres(ql)?:\/\//i.test(testDatabaseUrl)) {
  fail("TEST_DATABASE_URL deve apontar para um banco Postgres.");
}
if (process.env.DATABASE_URL && process.env.DATABASE_URL === testDatabaseUrl) {
  fail(
    "TEST_DATABASE_URL deve ser diferente de DATABASE_URL; use bancos separados.",
  );
}

const environment = {
  ...process.env,
  DATABASE_URL: testDatabaseUrl,
  DIRECT_URL: testDatabaseUrl,
};
const command = process.platform === "win32" ? "npx.cmd" : "npx";

const push = spawnSync(
  command,
  ["prisma", "db", "push", "--skip-generate"],
  { stdio: "inherit", env: environment, shell: false },
);
if (push.status !== 0) process.exit(push.status ?? 1);

const tests = spawnSync(
  command,
  ["vitest", "run"],
  { stdio: "inherit", env: environment, shell: false },
);
process.exit(tests.status ?? 1);
