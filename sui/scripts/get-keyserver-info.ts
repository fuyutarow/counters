#!/usr/bin/env tsx

/**
 * Studio Mirai Key Server情報取得スクリプト
 * Seal ServerのKeyServerオブジェクトから設定情報（公開鍵、URL、名前など）を取得
 */

import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";

const NETWORK = "testnet";
const STUDIO_MIRAI_KEY_SERVER_ID =
  "0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2";

async function getKeyServerInfo() {
  const suiClient = new SuiClient({ url: getFullnodeUrl(NETWORK) });

  try {
    const keyServerObject = await suiClient.getObject({
      id: STUDIO_MIRAI_KEY_SERVER_ID,
      options: {
        showContent: true,
        showType: true,
      },
    });

    if (!keyServerObject.data) {
      throw new Error("KeyServerオブジェクトが見つかりません");
    }

    if (keyServerObject.data.content?.dataType === "moveObject") {
      const fields = keyServerObject.data.content.fields as any;

      // Dynamic fieldsからV1情報を取得
      const dynamicFields = await suiClient.getDynamicFields({
        parentId: fields.id.id,
      });
      for (const field of dynamicFields.data) {
        if (field.name.value === "1") {
          // V1データ
          const v1Data = await suiClient.getDynamicFieldObject({
            parentId: fields.id.id,
            name: field.name,
          });

          if (v1Data.data?.content?.dataType === "moveObject") {
            const v1Fields = v1Data.data.content.fields as any;

            // V1データは value.fields の中にある
            const v1Data_fields = v1Fields.value?.fields;
            if (v1Data_fields) {
            }
          }
        }
      }
    }
  } catch (_error) {}
}

// 実行可能スクリプトとして動作するかメインモジュールとして呼ばれた場合に実行
if (import.meta.url === `file://${process.argv[1]}`) {
  getKeyServerInfo();
}

export { getKeyServerInfo };
