/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

import { bcs } from "@mysten/sui/bcs";
import { MoveStruct } from "../../../utils/index";
import * as object from "../sui/object";
import * as storage_resource from "./storage_resource";

const $moduleName = "walrus::blob";
export const Blob = new MoveStruct({
  name: `${$moduleName}::Blob`,
  fields: {
    id: object.UID,
    registered_epoch: bcs.u32(),
    blob_id: bcs.u256(),
    size: bcs.u64(),
    encoding_type: bcs.u8(),
    certified_epoch: bcs.option(bcs.u32()),
    storage: storage_resource.Storage,
    deletable: bcs.bool(),
  },
});
