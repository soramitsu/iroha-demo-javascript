import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

export default function globalSetup() {
  mkdirSync(resolve(process.cwd(), "coverage/.tmp"), { recursive: true });
}
