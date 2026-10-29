import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const id = process.env.MOA_DATABASE_ID;
if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id || "",
  ) ||
  id === "00000000-0000-4000-8000-000000000000"
) {
  throw new Error(
    "Set MOA_DATABASE_ID to the independent moa-civic-app D1 database ID before deployment.",
  );
}
const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(
  await fs.readFile(path.join(root, "wrangler.jsonc"), "utf8"),
);
config.main = path.join(root, config.main);
config.assets.directory = path.join(root, config.assets.directory);
config.d1_databases = config.d1_databases.map((database) => ({
  ...database,
  database_id: id,
  migrations_dir: path.join(root, database.migrations_dir),
}));
await fs.mkdir(path.join(root, ".output"), { recursive: true });
await fs.writeFile(
  path.join(root, ".output", "wrangler.deploy.json"),
  JSON.stringify(config, null, 2) + "\n",
);
console.log(
  "Prepared app-only deployment config. The local config and game repository were not changed.",
);
