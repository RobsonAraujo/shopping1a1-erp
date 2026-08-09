import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { readSession } from "@/lib/mercadolibre/session";
import { getVapidPublicKey } from "@/lib/push/webpush";
import { parseJsonBody } from "@/lib/api-validation";

const pushSubscriptionSchema = z.object({
  endpoint: z.string().min(1),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const deleteBodySchema = z.object({
  endpoint: z.string().min(1).optional(),
});

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function getPushSubscriptionDelegate() {
  const delegate = (prisma as unknown as { pushSubscription?: unknown }).pushSubscription;
  return delegate as
    | {
        findMany: typeof prisma.pushSubscription.findMany;
        upsert: typeof prisma.pushSubscription.upsert;
        deleteMany: typeof prisma.pushSubscription.deleteMany;
      }
    | undefined;
}

function prismaOutdatedResponse() {
  return NextResponse.json(
    { error: "push_subscription_model_unavailable", hint: "Run prisma generate and restart server." },
    { status: 503 },
  );
}

export async function GET() {
  const cookieStore = await cookies();
  const session = readSession(cookieStore);
  if (!session.userId) return unauthorized();

  const pushSubscription = getPushSubscriptionDelegate();
  if (!pushSubscription) return prismaOutdatedResponse();

  const subscriptions = await pushSubscription.findMany({
    where: { mlUserId: session.userId },
    select: { endpoint: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 1,
  });

  return NextResponse.json({
    vapidPublicKey: getVapidPublicKey(),
    pushConfigured: getVapidPublicKey() !== null,
    subscribed: subscriptions.length > 0,
    endpoint: subscriptions[0]?.endpoint ?? null,
  });
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const session = readSession(cookieStore);
  if (!session.userId) return unauthorized();

  const parsedBody = await parseJsonBody(request, pushSubscriptionSchema);
  if (!parsedBody.ok) return parsedBody.response;
  const {
    endpoint,
    keys: { p256dh, auth },
  } = parsedBody.data;

  const userAgent = request.headers.get("user-agent");
  const pushSubscription = getPushSubscriptionDelegate();
  if (!pushSubscription) return prismaOutdatedResponse();

  await pushSubscription.upsert({
    where: {
      mlUserId_endpoint: { mlUserId: session.userId, endpoint },
    },
    create: {
      mlUserId: session.userId,
      endpoint,
      p256dh,
      auth,
      userAgent,
    },
    update: {
      p256dh,
      auth,
      userAgent,
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const cookieStore = await cookies();
  const session = readSession(cookieStore);
  if (!session.userId) return unauthorized();

  let endpoint: string | null = null;
  try {
    const raw: unknown = await request.json();
    const parsed = deleteBodySchema.safeParse(raw);
    endpoint = parsed.success ? (parsed.data.endpoint ?? null) : null;
  } catch {
    endpoint = null;
  }

  const pushSubscription = getPushSubscriptionDelegate();
  if (!pushSubscription) return prismaOutdatedResponse();

  if (endpoint) {
    await pushSubscription.deleteMany({
      where: { mlUserId: session.userId, endpoint },
    });
  } else {
    await pushSubscription.deleteMany({
      where: { mlUserId: session.userId },
    });
  }

  return NextResponse.json({ ok: true });
}
