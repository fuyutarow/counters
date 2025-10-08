/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

import { bcs } from "@mysten/sui/bcs";
import { MoveTuple } from "../utils/index";
import * as vec_map from "./deps/sui/vec_map";

const $moduleName = "Walrus::pending_values";
export const PendingValues = new MoveTuple({
  name: `${$moduleName}::PendingValues`,
  fields: [vec_map.VecMap(bcs.u32(), bcs.u64())],
});
