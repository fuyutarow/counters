/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

import { bcs } from "@mysten/sui/bcs";
import { MoveStruct } from "../../../utils/index";
import * as object from "../sui/object";

const $moduleName = "walrus::storage_resource";
export const Storage = new MoveStruct({
  name: `${$moduleName}::Storage`,
  fields: {
    id: object.UID,
    start_epoch: bcs.u32(),
    end_epoch: bcs.u32(),
    storage_size: bcs.u64(),
  },
});
