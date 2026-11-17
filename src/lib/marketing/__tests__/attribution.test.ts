import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  attributionFromSearch,
  parseAttribution,
  parseAuthEvent,
  serializeAttribution,
  serializeAuthEvent,
} from "../attribution";

const NOW = new Date("2026-11-16T12:00:00.000Z");

describe("attributionFromSearch", () => {
  it("returns null for a direct visit, so it never overwrites an ad's origin", () => {
    assert.equal(attributionFromSearch("", "/beta", NOW), null);
    assert.equal(attributionFromSearch("?ref=menu&utm_source=", "/", NOW), null);
  });

  it("keeps UTM and Google click ids with the landing path", () => {
    const a = attributionFromSearch(
      "?utm_source=google&utm_medium=cpc&utm_campaign=beta-nov26&gclid=abc123&foo=bar",
      "/beta",
      NOW,
    );
    assert.deepEqual(a, {
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "beta-nov26",
      gclid: "abc123",
      landing: "/beta",
      capturedAt: NOW.toISOString(),
    });
  });

  it("clips oversized values", () => {
    const a = attributionFromSearch(`?utm_term=${"x".repeat(500)}`, "/", NOW);
    assert.equal(a?.utm_term?.length, 200);
  });
});

describe("parseAttribution", () => {
  it("round-trips what the client writes", () => {
    const a = attributionFromSearch("?utm_source=google&gclid=g1", "/beta", NOW);
    assert.ok(a);
    assert.deepEqual(parseAttribution(serializeAttribution(a)), a);
  });

  it("drops unknown keys and non-string values", () => {
    const raw = encodeURIComponent(
      JSON.stringify({ utm_source: "google", evil: "x", gclid: 42 }),
    );
    assert.deepEqual(parseAttribution(raw), { utm_source: "google" });
  });

  it("treats garbage as no attribution", () => {
    assert.equal(parseAttribution(undefined), null);
    assert.equal(parseAttribution("%E0%A4%A"), null);
    assert.equal(parseAttribution(encodeURIComponent("[1,2]")), null);
    assert.equal(parseAttribution(encodeURIComponent('"text"')), null);
  });
});

describe("auth event cookie", () => {
  it("carries sign_up with the offer, and login alone", () => {
    const signUp = serializeAuthEvent({ event: "sign_up", offer: "beta-30d-2026-11" });
    assert.deepEqual(parseAuthEvent(signUp), {
      event: "sign_up",
      offer: "beta-30d-2026-11",
    });
    assert.deepEqual(parseAuthEvent(serializeAuthEvent({ event: "login" })), {
      event: "login",
    });
  });

  it("accepts the value URL-encoded by the browser and rejects anything else", () => {
    assert.deepEqual(parseAuthEvent("sign_up%3Abeta-30d-2026-11"), {
      event: "sign_up",
      offer: "beta-30d-2026-11",
    });
    assert.equal(parseAuthEvent("purchase"), null);
    assert.equal(parseAuthEvent(undefined), null);
  });
});
