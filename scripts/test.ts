// Runs the API tests against a separate, throwaway database: npm test
// The test database is "<your database>_test": it is wiped and recreated on every run,
// so the real data is never touched. Needs the local MySQL running.
import "dotenv/config";
import { execSync, spawn } from "child_process";

const TEST_PORT = "4599";

const original = process.env.DB_CONNECTION_STRING;
if (!original) throw new Error("DB_CONNECTION_STRING is not set");

const url = new URL(original);
const dbName = url.pathname.replace(/^\//, "");
url.pathname = `/${dbName}_test`;
const testUrl = url.toString();

// Safety: never run against anything that isn't a "_test" database
if (testUrl === original || !url.pathname.endsWith("_test")) {
  throw new Error("Refusing to run tests: the test database name must end with _test");
}

const env = {
  ...process.env,
  DB_CONNECTION_STRING: testUrl,
  PORT: TEST_PORT,
  TEST_API_URL: `http://localhost:${TEST_PORT}/api`,
  TS_NODE_TRANSPILE_ONLY: "true",
};

const waitForServer = async () => {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(`${env.TEST_API_URL}`);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error("The test server did not start");
};

const main = async () => {
  console.log(`Preparando la base de pruebas "${dbName}_test" (se borra y se crea de nuevo)...`);
  execSync("npx prisma db push --force-reset --skip-generate", { env, stdio: "inherit" });

  const server = spawn(process.execPath, ["-r", "ts-node/register", "app.ts"], {
    env,
    stdio: "ignore",
  });

  let failed = false;
  try {
    await waitForServer();
    execSync(`"${process.execPath}" --test --test-reporter=spec -r ts-node/register tests/api.test.ts`, {
      env,
      stdio: "inherit",
    });
  } catch {
    failed = true;
  } finally {
    server.kill();
  }

  process.exit(failed ? 1 : 0);
};

main();
