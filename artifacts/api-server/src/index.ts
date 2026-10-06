import app from "./app";
import { logger } from "./lib/logger";
import { runSimulationTick } from "./routes/office";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

const simulator = setInterval(() => {
  void runSimulationTick().catch((error: unknown) => {
    logger.error({ err: error }, "Office simulator tick failed");
  });
}, 10_000);
simulator.unref();
