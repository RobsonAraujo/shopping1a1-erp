import "dotenv/config";

const url =
  process.env.CATALOG_COMPETITION_WEBHOOK_URL ??
  "http://localhost:3000/api/ml/notifications/catalog-competition";
const itemId = process.env.CATALOG_COMPETITION_ITEM_ID ?? "MLB4561866095";
const userId = Number(process.env.CATALOG_COMPETITION_ML_USER_ID ?? "1");
const status = process.env.CATALOG_COMPETITION_STATUS ?? "winning";

async function main() {
  const payload = {
    topic: "catalog_item_competition_status",
    resource: `/items/${itemId}/price_to_win`,
    user_id: userId,
    sent: new Date().toISOString(),
    // The route only honors these fields outside production. Production always
    // resolves real seller credentials and calls Mercado Livre price_to_win.
    debugBypassCredentials: true,
    debugPriceToWin: {
      status,
      price_to_win: 99.9,
      visit_share:
        status === "winning"
          ? "maximum"
          : status === "sharing_first_place" || status === "shared"
            ? "medium"
            : "minimum",
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log(`POST ${url}`);
  console.log(`HTTP ${res.status}`);
  console.log(text);

  if (!res.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Failed to simulate catalog competition webhook:", error);
  process.exit(1);
});
