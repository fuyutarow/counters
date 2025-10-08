/**************************************************************
 * THIS FILE IS GENERATED AND SHOULD NOT BE MANUALLY MODIFIED *
 **************************************************************/

/**
 * A utility module which implements an `ExchangeRate` struct and its methods. It
 * stores a fixed point exchange rate between the WAL token and pool shares.
 */

import { bcs } from "@mysten/sui/bcs";
import { MoveEnum, MoveStruct } from "../utils/index";

const $moduleName = "Walrus::pool_exchange_rate";
/** Represents the exchange rate for the staking pool. */
export const PoolExchangeRate = new MoveEnum({
  name: `${$moduleName}::PoolExchangeRate`,
  fields: {
    Flat: null,
    Variable: new MoveStruct({
      name: "PoolExchangeRate.Variable",
      fields: {
        wal_amount: bcs.u128(),
        share_amount: bcs.u128(),
      },
    }),
  },
});
