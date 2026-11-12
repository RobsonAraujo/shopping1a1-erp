import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CATALOG_RAISE_CHECK_LINE,
  buildRotinaView,
  type RotinaViewInput,
} from "@/lib/rotina/view";
import {
  applyActionOverrides,
  groupActiveByRule,
  summarizeActions,
} from "@/lib/rotina/view-summary";
import type { PromotionWindow } from "@/lib/mercadolibre/promotion-coverage";
import {
  NOW,
  TZ,
  catalogLive,
  competition,
  listing,
  settings,
  state,
  winningWithRoom,
} from "./fixtures";

function input(overrides: Partial<RotinaViewInput> = {}): RotinaViewInput {
  return {
    now: NOW,
    timeZone: TZ,
    settings: settings(),
    health: [],
    catalogLive: [],
    targets: new Map(),
    states: [],
    lastRun: null,
    lastCompleteRunAt: "2026-11-10T09:00:00.000Z",
    ...overrides,
  };
}

const ownNoPromo = listing({
  mlItemId: "OWN1",
  title: "Kit Escova",
  hasPromotion: false,
  regularPrice: null,
  salePrice: 129.9,
  floorAfterAdsPrice: 104.5,
  floorMcPrice: 99.8,
});
const ownNoAds = listing({ mlItemId: "OWN2", title: "Mouse W", adsStatus: "idle" });
const catalogRow = listing({
  mlItemId: "CAT1",
  title: "Fone X catálogo",
  catalogListing: true,
  floorAfterAdsPrice: 91.2,
  floorMcPrice: 88.7,
  linkedOwnItemId: "OWN1",
  listedAt: "2026-11-08T12:00:00.000Z",
});

describe("buildRotinaView", () => {
  it("builds the day's actions with floor and catalog verdict", () => {
    const view = buildRotinaView(
      input({
        health: [ownNoPromo, ownNoAds, catalogRow],
        catalogLive: [catalogLive({ mlItemId: "CAT1", priceToWin: 94.9 })],
      }),
    );

    const promo = view.actions.find((action) => action.id === "promo_missing:OWN1");
    assert.ok(promo);
    assert.equal(promo.segment, "own");
    assert.equal(promo.floor?.effectivePrice, 104.5);
    assert.equal(promo.floor?.maxDiscountPercent, 19);

    const losing = view.actions.find((action) => action.id === "catalog_losing:CAT1");
    assert.ok(losing);
    assert.equal(losing.segment, "catalog");
    assert.equal(losing.isNew, true, "started losing today");
    assert.match(losing.headline, /desde hoje às 10h05/);
    assert.equal(losing.verdict?.tone, "ok");
    assert.match(losing.verdict?.text ?? "", /sobra R\$\s?3,70/);

    assert.ok(view.actions.some((action) => action.id === "ads_missing:OWN2"));
    assert.equal(view.dataIsFromToday, true);
    assert.equal(view.info.linkedCatalog.length, 1);
    assert.equal(view.info.linkedCatalog[0].own.mlItemId, "OWN1");
  });

  it("orders groups by urgency and keeps new items first", () => {
    const view = buildRotinaView(
      input({
        health: [ownNoPromo, ownNoAds, catalogRow],
        catalogLive: [catalogLive({ mlItemId: "CAT1" })],
      }),
    );
    const groups = groupActiveByRule(view.actions, "all").map((group) => group.rule);
    assert.deepEqual(groups, ["catalog_losing", "ads_missing", "promo_missing"]);
    assert.deepEqual(
      groupActiveByRule(view.actions, "own").map((group) => group.rule),
      ["ads_missing", "promo_missing"],
    );
  });

  it("hides done actions and brings them back as 'continues' after newer data", () => {
    const doneEarlier = state({
      mlItemId: "OWN1",
      rule: "promo_missing",
      status: "done",
      statusChangedAt: "2026-11-10T08:00:00.000Z",
    });
    const fresh = buildRotinaView(input({ health: [ownNoPromo], states: [doneEarlier] }));
    const promo = fresh.actions.find((action) => action.id === "promo_missing:OWN1");
    assert.equal(promo?.bucket, "active");
    assert.equal(promo?.continues, true, "the 09h refresh still saw no promotion");

    const doneLater = { ...doneEarlier, statusChangedAt: "2026-11-10T14:00:00.000Z" };
    const hidden = buildRotinaView(input({ health: [ownNoPromo], states: [doneLater] }));
    const hiddenPromo = hidden.actions.find((action) => action.id === "promo_missing:OWN1");
    assert.equal(hiddenPromo?.bucket, "done");
    assert.equal(hiddenPromo?.doneToday, true);
  });

  it("shows a catalog takeover event on the own listing until acknowledged", () => {
    const event = state({
      mlItemId: "CAT1",
      rule: "catalog_takeover",
      status: "open",
      firstSeenAt: "2026-11-10T09:00:00.000Z",
      relatedItemId: "OWN1",
    });
    const view = buildRotinaView(input({ health: [ownNoPromo, catalogRow], states: [event] }));
    const takeover = view.actions.find((action) => action.rule === "catalog_takeover");
    assert.ok(takeover);
    assert.equal(takeover.listing.mlItemId, "OWN1");
    assert.equal(takeover.related?.mlItemId, "CAT1");
    assert.equal(takeover.segment, "own");
    assert.equal(takeover.isNew, true);
    assert.match(takeover.headline, /CAT1 em 08\/11/);

    const acked = buildRotinaView(
      input({ health: [ownNoPromo, catalogRow], states: [{ ...event, status: "done" }] }),
    );
    assert.equal(
      acked.actions.find((action) => action.rule === "catalog_takeover")?.bucket,
      "done",
    );
  });

  it("reflects a new target immediately and flags the stale floor", () => {
    const view = buildRotinaView(
      input({
        health: [listing({ mlItemId: "OWN3", marginAfterAdsPercent: 4, floorTargetPercent: 2 })],
        targets: new Map([["OWN3", { minMarginPercent: 6, tacosTargetPercent: null }]]),
      }),
    );
    const margin = view.actions.find((action) => action.id === "margin_below_min:OWN3");
    assert.ok(margin, "4% after ADS is below the listing's 6%");
    assert.equal(margin.listing.minMarginOverridden, true);
    assert.equal(margin.floor?.stale, true);
    assert.ok(view.warnings.some((warning) => warning.includes("outra meta")));
  });

  it("lists missing data, eligibility risk and today's resolutions", () => {
    const view = buildRotinaView(
      input({
        health: [
          listing({ mlItemId: "OWN4", exclusionReason: "missing_cost" }),
          listing({ mlItemId: "OWN5", tags: ["catalog_listing_eligible"] }),
        ],
        catalogLive: [catalogLive({ mlItemId: "CAT7", status: "winning", wonBackToday: true })],
        states: [
          state({
            mlItemId: "OWN5",
            rule: "promo_missing",
            status: "resolved",
            resolvedAt: "2026-11-10T09:00:00.000Z",
          }),
        ],
      }),
    );
    assert.deepEqual(
      view.info.dataMissing.map((item) => [item.mlItemId, item.note]),
      [["OWN4", "Sem custo"]],
    );
    assert.deepEqual(view.info.catalogEligible.map((item) => item.mlItemId), ["OWN5"]);
    assert.deepEqual(
      view.info.resolvedToday.map((item) => item.mlItemId).sort(),
      ["CAT7", "OWN5"],
    );
  });

  it("says what changed in each resolution, from today's data", () => {
    const resolved = (mlItemId: string, rule: string) =>
      state({ mlItemId, rule, status: "resolved", resolvedAt: "2026-11-10T09:00:00.000Z" });
    const view = buildRotinaView(
      input({
        settings: settings({ disabledRules: ["ads_missing"] }),
        health: [
          listing({ mlItemId: "PROMO", hasPromotion: true, salePrice: 89.9 }),
          listing({ mlItemId: "OFF", adsStatus: "idle" }),
          listing({ mlItemId: "PAUSED", mlStatus: "paused", pmaPrice: 120, salePrice: 100 }),
        ],
        catalogLive: [
          catalogLive({
            mlItemId: "CAT9",
            status: "winning",
            wonBackToday: true,
            statusSince: "2026-11-10T14:05:00.000Z",
          }),
        ],
        states: [
          resolved("PROMO", "promo_missing"),
          resolved("OFF", "ads_missing"),
          resolved("PAUSED", "below_pma"),
        ],
      }),
    );
    const outcomes = Object.fromEntries(
      view.info.resolvedToday.map((item) => [
        item.mlItemId,
        [item.note, item.outcome?.replace(/\u00a0/g, " ")],
      ]),
    );
    assert.deepEqual(outcomes, {
      PROMO: ["Sem promoção", "Agora em promoção a R$ 89,90"],
      // Sumiu porque a regra foi desligada, não porque o ADS foi ativado.
      OFF: ["Sem ADS ativo", "Regra desligada em Metas"],
      PAUSED: ["Abaixo do PMA", "Anúncio não está mais ativo no ML"],
      CAT9: ["Catálogo", "Voltou a ganhar a vitrine às 11h05"],
    });
  });

  it("tells when a scheduled promotion continues, and when it leaves a gap", () => {
    const active: PromotionWindow = {
      status: "started",
      name: "Oferta",
      type: "PRICE_DISCOUNT",
      startsAt: "2026-11-01T03:00:00.000Z",
      endsAt: "2026-11-12T02:59:00.000Z",
    };
    const pending = (name: string, startsAt: string, endsAt: string): PromotionWindow => ({
      status: "pending",
      name,
      type: "DEAL",
      startsAt,
      endsAt,
    });
    const view = buildRotinaView(
      input({
        health: [
          listing({
            mlItemId: "GAP",
            promotionName: "Oferta",
            promotionEndsAt: active.endsAt,
            promotionWindows: [
              active,
              pending("Relâmpago", "2026-11-12T03:00:00.000Z", "2026-11-13T02:59:00.000Z"),
              pending("Black", "2026-11-16T03:00:00.000Z", "2026-11-30T02:59:00.000Z"),
            ],
          }),
          listing({
            mlItemId: "CONTINUES",
            promotionName: "Oferta",
            promotionEndsAt: active.endsAt,
            promotionWindows: [
              active,
              pending("Black", "2026-11-12T03:00:00.000Z", "2026-11-30T02:59:00.000Z"),
            ],
          }),
        ],
        states: [
          state({
            mlItemId: "CONTINUES",
            rule: "promo_expiring",
            status: "resolved",
            resolvedAt: "2026-11-10T09:00:00.000Z",
          }),
        ],
      }),
    );

    const gap = view.actions.find((action) => action.id === "promo_expiring:GAP");
    assert.ok(gap);
    assert.equal(gap.headline, "Promoção programada “Relâmpago” termina em 2 dias (12/11)");
    assert.ok(gap.details.includes("Emenda com “Oferta”, que termina 11/11"));
    assert.ok(gap.details.includes("Programada “Black” só começa 16/11: 3 dias sem promoção"));

    assert.ok(!view.actions.some((action) => action.id === "promo_expiring:CONTINUES"));
    const resolved = view.info.resolvedToday.find((item) => item.mlItemId === "CONTINUES");
    assert.equal(resolved?.outcome, "Promoção programada “Black” até 29/11");
  });

  it("gives every listing row its own target and the segment default", () => {
    const view = buildRotinaView(
      input({
        settings: settings({
          ownMinMarginPercent: 2,
          catalogMinMarginPercent: 0,
          ownTacosTargetPercent: 4,
        }),
        health: [ownNoPromo, catalogRow],
        targets: new Map([["OWN1", { minMarginPercent: 5, tacosTargetPercent: null }]]),
      }),
    );
    const own = view.listings.find((row) => row.mlItemId === "OWN1");
    const catalog = view.listings.find((row) => row.mlItemId === "CAT1");
    assert.deepEqual(own?.target, {
      own: { minMarginPercent: 5, tacosTargetPercent: null },
      defaults: { minMarginPercent: 2, tacosTargetPercent: 4 },
    });
    assert.equal(own?.floor.targetPercent, 5);
    assert.deepEqual(catalog?.target, {
      own: { minMarginPercent: null, tacosTargetPercent: null },
      defaults: { minMarginPercent: 0, tacosTargetPercent: 4 },
    });
    // O card usa o mesmo par: o placeholder mostra o padrão, não a meta própria.
    const promo = view.actions.find((action) => action.id === "promo_missing:OWN1");
    assert.equal(promo?.listing.target.defaults.minMarginPercent, 2);
    assert.equal(promo?.listing.target.own.minMarginPercent, 5);
  });

  it("links each task to the ML screen where it gets done", () => {
    const view = buildRotinaView(
      input({
        health: [
          ownNoPromo,
          ownNoAds,
          { ...catalogRow, catalogProductId: "MLB27951053" },
          listing({
            mlItemId: "CAT2",
            catalogListing: true,
            catalogProductId: "MLB111",
            marginAfterAdsPercent: -1,
          }),
        ],
        catalogLive: [catalogLive({ mlItemId: "CAT1", priceToWin: 94.9 })],
      }),
    );
    const linksOf = (id: string) => {
      const action = view.actions.find((candidate) => candidate.id === id);
      assert.ok(action, `faltou a ação ${id}`);
      return [action.links.primary, ...action.links.extra].map((link) => [link.label, link.href]);
    };

    assert.deepEqual(linksOf("catalog_losing:CAT1"), [
      ["Editar preço", "https://www.mercadolivre.com.br/syi/core/modify?itemId=CAT1"],
      ["Ver concorrência", "https://www.mercadolivre.com.br/p/MLB27951053/s"],
    ]);
    assert.deepEqual(linksOf("promo_missing:OWN1"), [
      [
        "Abrir promoções",
        "https://vendedores.mercadolivre.com.br/anuncios/lista/promos#from=seller-menu",
      ],
    ]);
    const [adsLink] = linksOf("ads_missing:OWN2");
    assert.equal(adsLink[0], "Abrir Product Ads");
    // Sem advertiser_id/account_id fixos: cada organização tem os seus.
    assert.doesNotMatch(adsLink[1], /advertiser_id|account_id/);
    assert.deepEqual(linksOf("margin_below_min:CAT2"), [
      ["Editar preço", "https://www.mercadolivre.com.br/syi/core/modify?itemId=CAT2"],
      ["Ver concorrência", "https://www.mercadolivre.com.br/p/MLB111/s"],
    ]);
  });

  it("puts PMA and current TACOS on the card, but no TACOS without ADS", () => {
    const view = buildRotinaView(
      input({
        health: [
          { ...ownNoPromo, pmaPrice: 110, tacosPercent: 5.2, adsStatus: "active" },
          { ...ownNoAds, tacosPercent: 0 },
        ],
      }),
    );
    const promo = view.actions.find((action) => action.id === "promo_missing:OWN1");
    assert.equal(promo?.listing.pmaPrice, 110);
    assert.equal(promo?.listing.tacosPercent, 5.2);
    assert.equal(promo?.listing.adsPeriodDays, 7);
    const noAds = view.actions.find((action) => action.id === "ads_missing:OWN2");
    assert.equal(noAds?.listing.tacosPercent, null, "idle: o 0% da rodada não é TACOS real");
  });

  it("keeps when a done action was decided", () => {
    const view = buildRotinaView(
      input({
        health: [ownNoPromo, ownNoAds],
        states: [
          state({
            mlItemId: "OWN1",
            rule: "promo_missing",
            status: "done",
            statusChangedAt: "2026-11-10T13:32:00.000Z",
          }),
        ],
        lastCompleteRunAt: "2026-11-10T09:00:00.000Z",
      }),
    );
    const done = view.actions.find((action) => action.id === "promo_missing:OWN1");
    assert.equal(done?.doneToday, true);
    assert.equal(done?.decidedAt, "2026-11-10T13:32:00.000Z");
    const open = view.actions.find((action) => action.id === "ads_missing:OWN2");
    assert.equal(open?.bucket, "active");
    assert.equal(open?.decidedAt, null);
  });

  it("works for catalog listings before the first refresh", () => {
    const view = buildRotinaView(
      input({ catalogLive: [catalogLive({ mlItemId: "CAT8" })], lastCompleteRunAt: null }),
    );
    const losing = view.actions.find((action) => action.id === "catalog_losing:CAT8");
    assert.ok(losing);
    assert.equal(losing.listing.hasHealth, false);
    assert.equal(losing.verdict?.tone, "neutral");
    assert.equal(view.hasHealth, false);
    assert.equal(view.dataIsFromToday, false);
  });
});

describe("buildRotinaView: subir preço no catálogo", () => {
  const raised = winningWithRoom({ mlItemId: "CAT5", title: "Cabo USB (catálogo)" });

  it("shows both estimates, the gain and the check-after line, labelled as estimate", () => {
    const view = buildRotinaView(input({ catalogLive: [raised] }));
    const action = view.actions.find((item) => item.id === "catalog_raise_price:CAT5");
    assert.ok(action);
    assert.equal(action.segment, "catalog");
    assert.equal(action.ageLabel, null);
    assert.equal(action.catalog?.raise?.winCeiling, 43.65);
    assert.equal(action.catalog?.raise?.shareCeiling, 45);
    assert.match(action.headline, /concorrente mais barato está a R\$\s?45,00 \(Flex\)/);
    assert.ok(
      action.details.some((line) =>
        /^Estimativa: ganhar sozinho até ~R\$\s?43,65 · dividir o 1º lugar a ~R\$\s?45,00/.test(line),
      ),
    );
    assert.deepEqual(action.verdict, { tone: "neutral", text: CATALOG_RAISE_CHECK_LINE });
    assert.equal(action.floor, null, "subir não precisa do piso");
    assert.equal(action.links.primary.label, "Editar preço");
    assert.equal(action.links.extra[0]?.label, "Ver concorrência");
  });

  it("warns when your other listing in the same product sits below the ceiling", () => {
    const sibling = winningWithRoom({
      mlItemId: "CAT6",
      competition: competition({
        ownOfferCount: 2,
        ownOther: { itemId: "MLB-IRMAO", price: 41.5, logisticType: "fulfillment" },
      }),
    });
    const view = buildRotinaView(input({ catalogLive: [sibling] }));
    const action = view.actions.find((item) => item.id === "catalog_raise_price:CAT6");
    assert.ok(action);
    assert.ok(
      action.details.some((line) =>
        /^Seu outro anúncio neste produto \(MLB-IRMAO\) está a R\$\s?41,50: .*suba os dois\.$/.test(line),
      ),
    );
  });

  it("puts the estimated ceiling on the listings table only when it is a task", () => {
    const health = listing({ mlItemId: "CAT5", catalogListing: true, salePrice: 40 });
    const view = buildRotinaView(input({ health: [health], catalogLive: [raised] }));
    assert.equal(view.listings.find((row) => row.mlItemId === "CAT5")?.raiseCeiling, 43.65);

    const tight = buildRotinaView(
      input({
        health: [health],
        catalogLive: [raised],
        settings: settings({ catalogRaiseMinPercent: 50 }),
      }),
    );
    assert.equal(tight.listings.find((row) => row.mlItemId === "CAT5")?.raiseCeiling, null);
  });

  it("after 'feito', the next catalog reading tells how it went", () => {
    const done = state({
      mlItemId: "CAT5",
      rule: "catalog_raise_price",
      status: "done",
      statusChangedAt: "2026-11-10T12:00:00.000Z",
    });
    // Leitura das 14h (depois do clique): subiu para 45 e passou a dividir.
    const shared = buildRotinaView(
      input({
        states: [done],
        catalogLive: [
          catalogLive({
            mlItemId: "CAT5",
            status: "shared",
            sellerPrice: 45,
            priceToWin: 43.9,
            statusSince: "2026-11-10T13:05:00.000Z",
            recentRaise: { from: 40, to: 45, at: "2026-11-10T13:05:00.000Z" },
          }),
        ],
      }),
    );
    const outcome = shared.info.resolvedToday.find((item) => item.mlItemId === "CAT5");
    assert.equal(outcome?.outcomeTone, "warn");
    assert.match(outcome?.outcome ?? "", /Passou a dividir o 1º lugar a R\$\s?45,00: para ganhar sozinho, R\$\s?43,90/);
    const sharedCard = shared.actions.find((item) => item.id === "catalog_shared:CAT5");
    assert.ok(
      sharedCard?.details.some((line) => /Você subiu de R\$\s?40,00 para R\$\s?45,00/.test(line)),
    );

    // Leitura das 14h: subiu para 43,50 e continua ganhando, sem folga nova.
    const fine = buildRotinaView(
      input({
        states: [done],
        catalogLive: [
          winningWithRoom({
            mlItemId: "CAT5",
            sellerPrice: 43.5,
            priceToWin: 43.5,
          }),
        ],
      }),
    );
    const ok = fine.info.resolvedToday.find((item) => item.mlItemId === "CAT5");
    assert.equal(ok?.outcomeTone, "ok");
    assert.match(ok?.outcome ?? "", /Continua ganhando a R\$\s?43,50/);
  });

  it("stays in 'feitos hoje' until a newer catalog reading arrives", () => {
    const done = state({
      mlItemId: "CAT5",
      rule: "catalog_raise_price",
      status: "done",
      statusChangedAt: "2026-11-10T14:30:00.000Z",
    });
    const view = buildRotinaView(input({ states: [done], catalogLive: [raised] }));
    const action = view.actions.find((item) => item.id === "catalog_raise_price:CAT5");
    assert.equal(action?.bucket, "done");
    assert.equal(action?.doneToday, true);
    assert.equal(view.info.resolvedToday.some((item) => item.mlItemId === "CAT5"), false);
  });

  it("does not blame an old raise for a recent loss", () => {
    const view = buildRotinaView(
      input({
        catalogLive: [
          catalogLive({
            mlItemId: "CAT6",
            statusSince: "2026-11-10T13:05:00.000Z",
            recentRaise: { from: 40, to: 45, at: "2026-11-05T10:00:00.000Z" },
          }),
        ],
      }),
    );
    const losing = view.actions.find((item) => item.id === "catalog_losing:CAT6");
    assert.ok(losing);
    assert.equal(losing.details.some((line) => line.startsWith("Você subiu")), false);
  });
});

describe("view summary", () => {
  it("counts per segment and applies optimistic overrides", () => {
    const view = buildRotinaView(
      input({
        health: [ownNoPromo, ownNoAds, catalogRow],
        catalogLive: [catalogLive({ mlItemId: "CAT1" })],
      }),
    );
    const before = summarizeActions(view.actions);
    assert.equal(before.active, 3);
    assert.equal(before.bySegment.own, 2);
    assert.equal(before.bySegment.catalog, 1);
    assert.equal(before.newToday, 1);

    const after = summarizeActions(
      applyActionOverrides(
        view.actions,
        new Map([["ads_missing:OWN2", { bucket: "done" as const, doneToday: true }]]),
      ),
    );
    assert.equal(after.active, 2);
    assert.equal(after.doneToday, 1);
  });
});
