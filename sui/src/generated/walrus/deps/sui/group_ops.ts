/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

/** Generic Move and native functions for group operations. */

import { bcs } from "@mysten/sui/bcs";
import { MoveStruct } from "../../../utils/index";

const $moduleName = "0x2::group_ops";
export const Element = new MoveStruct({
  name: `${$moduleName}::Element`,
  fields: {
    bytes: bcs.vector(bcs.u8()),
  },
});
