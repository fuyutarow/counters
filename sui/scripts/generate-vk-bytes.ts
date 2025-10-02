/**
 * Generate VK bytes array for Move contract
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { serializeVerifyingKey, type VerifyingKey } from "../src/utils/verifyingKey";

const vkPath = path.join(process.cwd(), "public/circuits/keys/private_counter_vk.json");
const vkJson = JSON.parse(fs.readFileSync(vkPath, "utf-8")) as VerifyingKey;
const vkBytes = serializeVerifyingKey(vkJson);

const bytesPerLine = 12;
for (let i = 0; i < vkBytes.length; i += bytesPerLine) {
  const chunk = Array.from(vkBytes.slice(i, i + bytesPerLine));
  const _line = chunk.map((b) => `${b}`).join(", ");
}
