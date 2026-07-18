import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const real = resolve(__dirname, "../silicon-accounting-v2/dist/index.js");
const { main } = await import(real);
if (typeof main === "function") main();
