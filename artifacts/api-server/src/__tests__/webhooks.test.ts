/**
 * Clerk Webhook Tests
 *
 * Verifies that:
 *  1. Missing CLERK_WEBHOOK_SECRET → 500 (endpoint disabled).
 *  2. Missing svix headers → 400.
 *  3. Invalid/tampered signature → 400 (no DB writes).
 *  4. Valid user.deleted event → diary, meal set, and user preference rows deleted.
 *  5. Unknown event types are accepted but ignored (received: true).
 *  6. user.deleted with no userId in payload → 400.
 *  7. eq() is called with the deleted userId (user isolation).
 *
 * Strategy: same mock pattern as auth-isolation.test.ts. svix Webhook is
 * mocked via vi.hoisted() so the class constructor works correctly and tests
 * are not coupled to real HMAC computation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── svix shared state (must use vi.hoisted so it's available when vi.mock
//     factory runs; plain module-level lets are in the TDZ at that point) ────
const svixState = vi.hoisted(() => ({
  shouldFail: false,
  payload: null as unknown,
}));

// ─── svix mock ────────────────────────────────────────────────────────────────
vi.mock("svix", () => ({
  Webhook: class MockWebhook {
    verify(_payload: unknown, _headers: unknown): unknown {
      if (svixState.shouldFail) throw new Error("Signature mismatch");
      return svixState.payload;
    }
  },
}));

// ─── Clerk mock ───────────────────────────────────────────────────────────────
vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: null })),
  clerkMiddleware: vi.fn(
    () => (_req: unknown, _res: unknown, next: () => void) => next()
  ),
}));

vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: vi.fn(() => "pk_test_mock"),
}));

// ─── Drizzle-orm helpers mock ─────────────────────────────────────────────────
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ _op: "eq", args })),
  and: vi.fn((...args: unknown[]) => ({ _op: "and", args })),
  isNull: vi.fn((...args: unknown[]) => ({ _op: "isNull", args })),
  or: vi.fn((...args: unknown[]) => ({ _op: "or", args })),
  ilike: vi.fn((...args: unknown[]) => ({ _op: "ilike", args })),
}));

// ─── DB mock ──────────────────────────────────────────────────────────────────
function makeChain(value: unknown) {
  const target = {
    then(
      onFulfilled?: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown
    ) {
      return Promise.resolve(value).then(onFulfilled, onRejected);
    },
    catch(onRejected?: (e: unknown) => unknown) {
      return Promise.resolve(value).catch(onRejected);
    },
    finally(onFinally?: () => void) {
      return Promise.resolve(value).finally(onFinally);
    },
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return t[prop as keyof typeof t];
      }
      return (..._args: unknown[]) => makeChain(value);
    },
  });
}

const mockDb = {
  select: vi.fn(() => makeChain([])),
  insert: vi.fn(() => makeChain([])),
  delete: vi.fn(() => makeChain([])),
  update: vi.fn(() => makeChain([])),
};

const fakeTable = {};
const fakeUserPreferencesTable = {};

vi.mock("@workspace/db", () => ({
  db: mockDb,
  diaryEntriesTable: fakeTable,
  foodsTable: fakeTable,
  mealSetsTable: fakeTable,
  mealSetItemsTable: fakeTable,
  userPreferencesTable: fakeUserPreferencesTable,
}));

// ─── Import app AFTER all vi.mock() declarations ──────────────────────────────
import request from "supertest";
const { default: app } = await import("../app.js");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setSvixVerifies(payload: unknown) {
  svixState.shouldFail = false;
  svixState.payload = payload;
}

function setSvixFails() {
  svixState.shouldFail = true;
  svixState.payload = null;
}

function svixHeaders() {
  return {
    "svix-id": "msg_test_123",
    "svix-timestamp": "1700000000",
    "svix-signature": "v1,dGVzdA==",
  };
}

function userDeletedPayload(userId: string) {
  return { type: "user.deleted", data: { id: userId } };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockDb.delete.mockClear();
  mockDb.select.mockClear();
  // Default: verification succeeds with a user.deleted event
  setSvixVerifies(userDeletedPayload("user-default"));
  // Endpoint enabled by default
  process.env.CLERK_WEBHOOK_SECRET = "whsec_test_secret";
});

afterEach(() => {
  delete process.env.CLERK_WEBHOOK_SECRET;
});

describe("POST /api/webhooks/clerk – configuration guard", () => {
  it("returns 500 when CLERK_WEBHOOK_SECRET is not set", async () => {
    delete process.env.CLERK_WEBHOOK_SECRET;

    const res = await request(app)
      .post("/api/webhooks/clerk")
      .set(svixHeaders())
      .set("Content-Type", "application/json")
      .send(JSON.stringify(userDeletedPayload("user-x")));

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: "Webhook secret not configured" });
    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/clerk – signature verification", () => {
  it("returns 400 when svix headers are missing", async () => {
    const res = await request(app)
      .post("/api/webhooks/clerk")
      // Deliberately omit svix-id / svix-timestamp / svix-signature
      .set("Content-Type", "application/json")
      .send(JSON.stringify(userDeletedPayload("user-x")));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Missing svix headers" });
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("returns 400 when the signature is invalid", async () => {
    setSvixFails();

    const res = await request(app)
      .post("/api/webhooks/clerk")
      .set(svixHeaders())
      .set("Content-Type", "application/json")
      .send(JSON.stringify(userDeletedPayload("user-x")));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Invalid webhook signature" });
  });

  it("does not touch the database when signature verification fails", async () => {
    setSvixFails();

    await request(app)
      .post("/api/webhooks/clerk")
      .set(svixHeaders())
      .set("Content-Type", "application/json")
      .send(JSON.stringify(userDeletedPayload("user-important")));

    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/clerk – user.deleted handling", () => {
  it("deletes diary entries, meal sets, and preferences for the deleted userId", async () => {
    const userId = "user-to-delete";
    setSvixVerifies(userDeletedPayload(userId));

    const res = await request(app)
      .post("/api/webhooks/clerk")
      .set(svixHeaders())
      .set("Content-Type", "application/json")
      .send(JSON.stringify(userDeletedPayload(userId)));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });
    expect(mockDb.delete).toHaveBeenCalledTimes(3);
    expect(mockDb.delete).toHaveBeenCalledWith(fakeUserPreferencesTable);
  });

  it("returns 400 when user.deleted payload is missing the user id", async () => {
    setSvixVerifies({ type: "user.deleted", data: {} });

    const res = await request(app)
      .post("/api/webhooks/clerk")
      .set(svixHeaders())
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "user.deleted", data: {} }));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: "Missing user id in event payload" });
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("ignores unknown event types without touching the database", async () => {
    setSvixVerifies({ type: "user.created", data: { id: "user-new" } });

    const res = await request(app)
      .post("/api/webhooks/clerk")
      .set(svixHeaders())
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "user.created", data: { id: "user-new" } }));

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ received: true });
    expect(mockDb.delete).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/clerk – user isolation", () => {
  it("passes only the deleted userId to the eq() filter (no other users affected)", async () => {
    const { eq } = await import("drizzle-orm");
    const deletedUserId = "user-deleted-123";
    setSvixVerifies(userDeletedPayload(deletedUserId));
    vi.mocked(eq).mockClear();

    const res = await request(app)
      .post("/api/webhooks/clerk")
      .set(svixHeaders())
      .set("Content-Type", "application/json")
      .send(JSON.stringify(userDeletedPayload(deletedUserId)));

    expect(res.status).toBe(200);

    // eq() must have been called with the deleted user's id
    const eqCalls = vi.mocked(eq).mock.calls;
    const deletedUserFilterCalls = eqCalls.filter(
      ([, value]) => value === deletedUserId
    );
    expect(deletedUserFilterCalls.length).toBeGreaterThan(0);

    // eq() must NOT have been called with any unrelated userId string
    const otherUserFilterCalls = eqCalls.filter(
      ([, value]) =>
        typeof value === "string" &&
        value !== deletedUserId &&
        value.startsWith("user-")
    );
    expect(otherUserFilterCalls.length).toBe(0);
  });
});
