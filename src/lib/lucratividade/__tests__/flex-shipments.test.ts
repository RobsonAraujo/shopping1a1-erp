import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OrderSearchOrder } from "@/lib/mercadolibre/types";
import { lineMayShipFromSeller, shipmentIdsToClassify } from "../flex-shipments";

function order(
  shipmentId: number | undefined,
  stocks: Array<{ node_id?: string | null; store_id?: string | number | null } | null | undefined>,
  status = "paid",
): OrderSearchOrder {
  return {
    id: Math.random(),
    status,
    shipping: shipmentId === undefined ? undefined : { id: shipmentId },
    order_items: stocks.map((stock) => ({
      item: { id: "MLB1" },
      quantity: 1,
      unit_price: 10,
      stock,
    })),
  };
}

describe("lineMayShipFromSeller", () => {
  it("centro do ML (nó sem store_id) é Full; nó do vendedor ou sem nó, não se sabe", () => {
    assert.equal(lineMayShipFromSeller({ stock: { node_id: "BRSP15", store_id: null } }), false);
    assert.equal(lineMayShipFromSeller({ stock: { node_id: "BRSP15" } }), false);
    assert.equal(
      lineMayShipFromSeller({ stock: { node_id: "BRP17013423321", store_id: "81328267" } }),
      true,
    );
    assert.equal(lineMayShipFromSeller({ stock: { node_id: "BRP1", store_id: 81328267 } }), true);
    assert.equal(lineMayShipFromSeller({ stock: { node_id: "  ", store_id: null } }), true);
    assert.equal(lineMayShipFromSeller({ stock: null }), true);
    assert.equal(lineMayShipFromSeller({}), true);
  });
});

describe("shipmentIdsToClassify", () => {
  it("só consulta envios de estoque próprio, uma vez cada", () => {
    const ids = shipmentIdsToClassify([
      order(1, [{ node_id: "BRSP15", store_id: null }]), // Full
      order(2, [{ node_id: "BRP17013423321", store_id: "81328267" }]), // Flex ou Coleta
      order(2, [{ node_id: "BRP17013423321", store_id: "81328267" }]), // mesmo pacote
      order(3, [{ node_id: "BRSP15", store_id: null }, undefined]), // uma linha sem nó
      order(4, [{ node_id: "BRP17013423321", store_id: "81328267" }], "cancelled"),
      order(undefined, [{ node_id: "BRP17013423321", store_id: "81328267" }]), // sem envio do ML
    ]);
    assert.deepEqual(ids, ["2", "3"]);
  });
});
