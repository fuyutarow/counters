import { bcs } from "@mysten/sui/bcs";

// Read public inputs from the proof generation
const saltHash = BigInt(
  "12326503012965816391338144612242952408728683609716147019497703475006801258307",
);
const oldHash = BigInt(
  "9904646155488355737762297645225334693069781832889131634543122060982625196787",
);
const newHash = BigInt(
  "14800396336478473958655799498724128728735427661463011194055900610499073368872",
);

// Serialize as three u256 values concatenated
const saltBytes = bcs.u256().serialize(saltHash).toBytes();
const oldBytes = bcs.u256().serialize(oldHash).toBytes();
const newBytes = bcs.u256().serialize(newHash).toBytes();

const serialized = new Uint8Array([
  ...Array.from(saltBytes),
  ...Array.from(oldBytes),
  ...Array.from(newBytes),
]);

// Convert to hex string
const _hex = Buffer.from(serialized).toString("hex");
