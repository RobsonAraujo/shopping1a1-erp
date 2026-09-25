import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { LEAN_SNAPSHOT_PAYLOAD_KEYS } from "@/lib/dre/dre-calculations";
import {
  parseSnapshotPayload,
  snapshotPayloadToLines,
} from "@/lib/dre/dre-month-data";
import { computeDreTotals } from "@/lib/dre/dre-calculations";

/**
 * A Home lê os snapshots de DRE com o `payload` projetado (sem os arrays de
 * breakdown) porque o payload completo custava ~3 MB de egress por
 * carregamento — e a Home é a página que o usuário abre toda hora.
 *
 * Estes testes fixam a condição que torna a projeção segura: **o que ficou de
 * fora não entra na conta dos totais**. Se algum dia um total passar a depender
 * de um breakdown, o teste quebra aqui em vez de a Home passar a mostrar um
 * número diferente do DRE em produção.
 */

function fullPayload(): Record<string, unknown> {
  const breakdown = Array.from({ length: 200 }, (_, i) => ({
    key: `SKU-${i}`,
    sku: `SKU-${i}`,
    title: `Produto ${i}`,
    quantity: i,
    unitCost: 10 + i,
    totalCost: (10 + i) * i,
    amount: i * 3,
    missingCost: false,
  }));

  return {
    revenueMl: 73798.5,
    cancelledSalesMl: -1200.25,
    saleFeeMl: -9000.1,
    partialReturnsMl: -300,
    returnFeeMl: -120.5,
    specialFeesMl: -75,
    productCostErp: -40000.4,
    taxErp: -8000.75,
    sellerShippingMl: -2500,
    fullShippingMl: -1800,
    fullStorageMl: -300,
    fullNonComplianceMl: -50,
    minhaPaginaMl: -25,
    affiliateFeeMl: -10,
    adsCost: 4000,
    billingSource: "billing",
    isPartial: false,
    incompleteProductCostCount: 3,
    syncWarnings: ["aviso a", "aviso b"],
    cancelledIncludeOverlay: {
      revenueGross: 1200.25,
      productCostErp: -600,
      taxErp: -120,
    },
    fullReportSourced: true,
    syncedLineBaseline: { revenueMl: 73798.5 },
    manuallyEditedLineKeys: ["saleFeeMl"],
    hasRealSyncBaseline: true,
    // tudo daqui pra baixo é o que a projeção deixa no banco
    productCostBreakdown: breakdown,
    taxBreakdown: breakdown,
    revenueBreakdown: breakdown,
    cancelledSalesBreakdown: breakdown,
    saleFeeBreakdown: breakdown,
    sellerShippingBreakdown: breakdown,
    adsCostBreakdown: breakdown,
    partialReturnsBreakdown: breakdown,
    returnFeeBreakdown: breakdown,
    specialFeesBreakdown: breakdown,
    fullShippingBreakdown: breakdown,
    fullStorageBreakdown: breakdown,
    fullNonComplianceBreakdown: breakdown,
    minhaPaginaBreakdown: breakdown,
    affiliateFeeBreakdown: breakdown,
    syncedBreakdownBaseline: { revenueMl: breakdown },
  };
}

/** O mesmo que o `jsonb_build_object` da query faz no Postgres. */
function project(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    LEAN_SNAPSHOT_PAYLOAD_KEYS.map((key) => [key, payload[key]]),
  );
}

const MANUAL_COSTS = [{ costItemId: "aluguel", amount: 4000 }];

function totalsFor(raw: Record<string, unknown>) {
  const parsed = parseSnapshotPayload(raw);
  assert.ok(parsed, "payload precisa ser parseável");
  return computeDreTotals(
    snapshotPayloadToLines(parsed),
    parsed.adsCost,
    MANUAL_COSTS,
    [],
    [],
    [],
    [],
  );
}

describe("projeção lean do snapshot de DRE", () => {
  it("produz exatamente os mesmos totais que o payload completo", () => {
    const full = fullPayload();
    assert.deepEqual(totalsFor(project(full)), totalsFor(full));
  });

  it("mantém na projeção todas as linhas que formam os totais", () => {
    const parsed = parseSnapshotPayload(fullPayload());
    assert.ok(parsed);
    for (const key of Object.keys(snapshotPayloadToLines(parsed))) {
      assert.ok(
        LEAN_SNAPSHOT_PAYLOAD_KEYS.includes(key),
        `"${key}" entra no cálculo dos totais e precisa estar na projeção`,
      );
    }
    assert.ok(LEAN_SNAPSHOT_PAYLOAD_KEYS.includes("adsCost"));
    // overlay de cancelados mexe nos totais — não pode ficar de fora
    assert.ok(LEAN_SNAPSHOT_PAYLOAD_KEYS.includes("cancelledIncludeOverlay"));
  });

  it("não traz nenhum array de breakdown (é o peso da coluna)", () => {
    for (const key of LEAN_SNAPSHOT_PAYLOAD_KEYS) {
      assert.ok(
        !key.endsWith("Breakdown") && key !== "syncedBreakdownBaseline",
        `"${key}" é auditoria por SKU e não deve vir pra Home`,
      );
    }
  });

  it("é drasticamente menor que o payload completo", () => {
    const full = fullPayload();
    const fullSize = JSON.stringify(full).length;
    const leanSize = JSON.stringify(project(full)).length;
    assert.ok(
      leanSize * 50 < fullSize,
      `projeção deveria ser ordens de grandeza menor (cheio ${fullSize}, lean ${leanSize})`,
    );
  });

  it("sobrevive a um payload sem nenhum breakdown (mês antigo)", () => {
    const minimal = project(fullPayload());
    assert.ok(parseSnapshotPayload(minimal));
    assert.equal(totalsFor(minimal).totalEntrada, totalsFor(fullPayload()).totalEntrada);
  });
});
