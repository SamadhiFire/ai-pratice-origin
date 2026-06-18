const { DEFAULT_PORT } = require("./constants");
const { createApp } = require("./app");
const { createDefaultStore } = require("./store");

function describeStore(store) {
  if (store.driver === "file") {
    return `file (${store.filePath})`;
  }
  if (store.driver === "mongodb") {
    return `mongodb (${store.dbName}/${store.collectionName})`;
  }
  return store.driver || "unknown";
}

async function main() {
  const store = await createDefaultStore();
  const app = createApp(store);
  const port = Number(process.env.PORT || DEFAULT_PORT);

  app.server.listen(port, () => {
    process.stdout.write(
      `AIhouduan backend skeleton listening on http://localhost:${port} using ${describeStore(store)}\n`
    );
  });

  async function shutdown() {
    app.server.close(async () => {
      await store.close();
      process.exit(0);
    });
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});

