import { migrateDown, migrateUp } from "./migrate-runner.js";

const cmd = process.argv[2] || "up";
if (cmd === "down") {
  console.log("[migrate] down", migrateDown());
} else {
  console.log("[migrate] up", migrateUp());
}
