import { migrate } from "./client.js";
import { botConfig } from "../config.js";

migrate();
console.log(`[db] Migrated ${botConfig.dbPath}`);
