import { ensureSchema } from "../lib/db";

async function main() {
  await ensureSchema();
  console.log("Schema ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
