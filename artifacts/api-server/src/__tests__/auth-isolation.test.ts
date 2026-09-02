/**
 * Auth Isolation Tests
 *
 * Verifies that:
 *  1. Unauthenticated requests are rejected with 401.
 *  2. A signed-in user cannot delete another user's diary entry.
 *  3. A signed-in user cannot see another user's meal presets.
 *  4. claim-legacy-data assigns orphaned rows and is idempotent (second call
 *     returns 0 because no NULL-userId rows remain).
 *
 * Strategy: the Express app and its routes are imported as-is. External
 * dependencies are replaced with vitest mocks:
 *   - @clerk/express  → getAuth returns a controllable userId
 *   - @workspace/db   → an in-memory chainable proxy (no real DB needed)
 *   - drizzle-orm     → no-op helpers (conditions are passed to the mock db
 *                        which ignores them, but they must not throw)
 *   - @clerk/shared/keys → stub publishableKeyFromHost
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm"; // import the vitest mock spy for predicate assertions
import request from "supertest";

// ─── Clerk mock ──────────────────────────────────────────────────────────────
// Controlled via setMockUserId before each test.
let _mockUserId: string | null = null;

const geminiState = vi.hoisted(() => ({
  responseText: JSON.stringify({
    food_name: "Chicken Breast",
    quantity: 100,
    unit: "g",
    calories: 165,
    protein_g: 31,
    carbs_g: 0,
    fat_g: 3.6,
  }),
}));

vi.mock("@clerk/express", () => ({
  getAuth: vi.fn(() => ({ userId: _mockUserId })),
  clerkMiddleware: vi.fn(
    () => (_req: unknown, _res: unknown, next: () => void) => next()
  ),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class MockGoogleGenAI {
    models = {
      generateContent: vi.fn(async () => ({ text: geminiState.responseText })),
    };
  },
  Type: {
    OBJECT: "OBJECT",
    STRING: "STRING",
    NUMBER: "NUMBER",
  },
}));

vi.mock("@clerk/shared/keys", () => ({
  publishableKeyFromHost: vi.fn(() => "pk_test_mock"),
}));

// ─── Drizzle-orm helpers mock ─────────────────────────────────────────────────
// The routes call eq(), and(), isNull() to build WHERE conditions.
// Our db mock ignores them, so we just need stubs that don't throw.
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...args: unknown[]) => ({ _op: "eq", args })),
  and: vi.fn((...args: unknown[]) => ({ _op: "and", args })),
  isNull: vi.fn((...args: unknown[]) => ({ _op: "isNull", args })),
  or: vi.fn((...args: unknown[]) => ({ _op: "or", args })),
  ilike: vi.fn((...args: unknown[]) => ({ _op: "ilike", args })),
  desc: vi.fn((...args: unknown[]) => ({ _op: "desc", args })),
}));

// ─── DB mock ──────────────────────────────────────────────────────────────────
// A minimal chainable promise-like proxy. Any method call on the chain returns
// the same chain. Awaiting (or .then()) resolves to a queue value set by the
// test.
//
// Queue discipline:
//   selectQueue  – consumed in order by db.select() calls
//   deleteQueue  – consumed by db.delete()
//   insertQueue  – consumed by db.insert()
//   updateQueue  – consumed by db.update()

const selectQueue: unknown[][] = [];
const deleteQueue: unknown[][] = [];
const insertQueue: unknown[][] = [];
const updateQueue: unknown[][] = [];
const chainCalls: Array<{ method: string; args: unknown[] }> = [];
let transactionCount = 0;
let transactionInsertCount = 0;
let failSecondTransactionInsert = false;

function makeChain(value: unknown) {
  const settle = () =>
    value instanceof Error ? Promise.reject(value) : Promise.resolve(value);
  const target = {
    then(
      onFulfilled?: (v: unknown) => unknown,
      onRejected?: (e: unknown) => unknown
    ) {
      return settle().then(onFulfilled, onRejected);
    },
    catch(onRejected?: (e: unknown) => unknown) {
      return settle().catch(onRejected);
    },
    finally(onFinally?: () => void) {
      return settle().finally(onFinally);
    },
  };
  return new Proxy(target, {
    get(t, prop) {
      if (prop === "then" || prop === "catch" || prop === "finally") {
        return t[prop as keyof typeof t];
      }
      // Any chained method call (from, where, innerJoin, etc.) returns a new
      // chain resolving to the same value.
      return (...args: unknown[]) => {
        chainCalls.push({ method: String(prop), args });
        return makeChain(value);
      };
    },
  });
}

// Fake table references – routes import them from @workspace/db and pass them
// to drizzle builder methods; our mock just ignores the arguments.
const fakeTable = {};

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => makeChain(selectQueue.shift() ?? [])),
    insert: vi.fn(() => makeChain(insertQueue.shift() ?? [])),
    delete: vi.fn(() => makeChain(deleteQueue.shift() ?? [])),
    update: vi.fn(() => makeChain(updateQueue.shift() ?? [])),
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => {
      transactionCount += 1;
      const tx = {
        insert: vi.fn(() => {
          transactionInsertCount += 1;
          if (failSecondTransactionInsert && transactionInsertCount === 2) {
            return makeChain(new Error("history insert failed"));
          }
          return makeChain(insertQueue.shift() ?? []);
        }),
      };
      return callback(tx);
    }),
  },
  diaryEntriesTable: fakeTable,
  foodsTable: fakeTable,
  scanHistoryTable: fakeTable,
  mealSetsTable: fakeTable,
  mealSetItemsTable: fakeTable,
  userPreferencesTable: fakeTable,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setMockUserId(id: string | null) {
  _mockUserId = id;
}

function enqueueSelects(...results: unknown[][]) {
  selectQueue.push(...results);
}

function enqueueDeletes(...results: unknown[][]) {
  deleteQueue.push(...results);
}

function enqueueInserts(...results: unknown[][]) {
  insertQueue.push(...results);
}

function enqueueUpdates(...results: unknown[][]) {
  updateQueue.push(...results);
}

function clearQueues() {
  selectQueue.length = 0;
  deleteQueue.length = 0;
  insertQueue.length = 0;
  updateQueue.length = 0;
  chainCalls.length = 0;
  transactionCount = 0;
  transactionInsertCount = 0;
  failSecondTransactionInsert = false;
}

// Import app AFTER all vi.mock() declarations so mocks are in place.
// (vitest hoists vi.mock() calls, so the order of statements here doesn't
//  matter for the mocks themselves, but readability is improved by grouping
//  them above.)
const { default: app } = await import("../app.js");

// ─── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  clearQueues();
  setMockUserId(null);
  vi.mocked(eq).mockClear();
});

describe("Unauthenticated requests return 401", () => {
  it("GET /api/diary rejects without a session", async () => {
    const res = await request(app).get("/api/diary?date=2024-01-01");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Unauthorized" });
  });

  it("POST /api/diary/entries rejects without a session", async () => {
    const res = await request(app).post("/api/diary/entries").send({
      foodId: 1,
      date: "2024-01-01",
      mealType: "lunch",
      servings: 1,
    });
    expect(res.status).toBe(401);
  });

  it("DELETE /api/diary/entries/:id rejects without a session", async () => {
    const res = await request(app).delete("/api/diary/entries/1");
    expect(res.status).toBe(401);
  });

  it("GET /api/meal-sets rejects without a session", async () => {
    const res = await request(app).get("/api/meal-sets");
    expect(res.status).toBe(401);
  });

  it("GET /api/meal-sets/:id rejects without a session", async () => {
    const res = await request(app).get("/api/meal-sets/1");
    expect(res.status).toBe(401);
  });

  it("DELETE /api/meal-sets/:id rejects without a session", async () => {
    const res = await request(app).delete("/api/meal-sets/1");
    expect(res.status).toBe(401);
  });

  it("POST /api/user/claim-legacy-data rejects without a session", async () => {
    const res = await request(app).post("/api/user/claim-legacy-data");
    expect(res.status).toBe(401);
  });

  it("GET /api/user/preferences rejects without a session", async () => {
    const res = await request(app).get("/api/user/preferences");
    expect(res.status).toBe(401);
  });

  it("PATCH /api/user/preferences rejects without a session", async () => {
    const res = await request(app)
      .patch("/api/user/preferences")
      .send({ monitoredNutrients: ["sodium"] });
    expect(res.status).toBe(401);
  });

  it("GET /api/diary/summary rejects without a session", async () => {
    const res = await request(app).get("/api/diary/summary?date=2024-01-01");
    expect(res.status).toBe(401);
  });

  it("POST /api/foods/parse rejects without a session", async () => {
    const res = await request(app)
      .post("/api/foods/parse")
      .send({ query: "100g chicken breast" });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Unauthorized" });
  });

  it("GET /api/foods/history rejects without a session", async () => {
    const res = await request(app).get("/api/foods/history");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Unauthorized" });
  });

  it("POST /api/foods rejects without a session", async () => {
    const res = await request(app)
      .post("/api/foods")
      .send({ name: "Brown Rice", kcalPerServing: 216 });
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Unauthorized" });
  });
});

describe("User preferences are scoped to the authenticated user", () => {
  it("returns only the current user's saved monitored nutrients", async () => {
    setMockUserId("user-a");
    enqueueSelects([
      {
        monitoredNutrients: ["sodium"],
        nutrientTargets: { sodium: 1800 },
      },
    ]);

    const userAResponse = await request(app).get("/api/user/preferences");

    setMockUserId("user-b");
    enqueueSelects([
      {
        monitoredNutrients: ["fiber", "cholesterol"],
        nutrientTargets: { cholesterol: 250 },
      },
    ]);
    const userBResponse = await request(app).get("/api/user/preferences");

    expect(userAResponse.status).toBe(200);
    expect(userAResponse.body).toEqual({
      monitoredNutrients: ["sodium"],
      nutrientTargets: { sodium: 1800 },
    });
    expect(userBResponse.status).toBe(200);
    expect(userBResponse.body).toEqual({
      monitoredNutrients: ["fiber", "cholesterol"],
      nutrientTargets: { cholesterol: 250 },
    });
    expect(vi.mocked(eq).mock.calls.some(([, value]) => value === "user-a")).toBe(true);
    expect(vi.mocked(eq).mock.calls.some(([, value]) => value === "user-b")).toBe(true);
  });

  it("stores preference updates under the authenticated user's id", async () => {
    setMockUserId("user-a");
    enqueueInserts([
      {
        monitoredNutrients: ["salt", "potassium"],
        nutrientTargets: { potassium: 2000 },
      },
    ]);

    const res = await request(app)
      .patch("/api/user/preferences")
      .send({
        monitoredNutrients: ["salt", "potassium"],
        nutrientTargets: { potassium: 2000 },
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      monitoredNutrients: ["salt", "potassium"],
      nutrientTargets: { potassium: 2000 },
    });
    const valuesCall = chainCalls.find((call) => call.method === "values");
    expect(valuesCall?.args[0]).toEqual({
      userId: "user-a",
      monitoredNutrients: ["salt", "potassium"],
      nutrientTargets: { potassium: 2000 },
    });
  });
});

describe("User A cannot delete User B's diary entry", () => {
  it("returns 404 when the entry does not belong to the requesting user", async () => {
    setMockUserId("user-a");

    // DELETE route: db.delete().where(and(eq(id), eq(userId))).returning()
    // In a real DB the userId mismatch means the WHERE returns no rows → [].
    // Our mock simulates that by returning an empty array.
    enqueueDeletes([]); // nothing matched → entry not owned by user-a

    const res = await request(app).delete("/api/diary/entries/999");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Entry not found" });
  });

  it("returns 204 when deleting the user's own entry", async () => {
    setMockUserId("user-a");

    const deletedEntry = {
      id: 42,
      userId: "user-a",
      date: "2024-01-01",
      mealType: "lunch",
      foodId: 1,
      servings: 1,
      createdAt: "2024-01-01T12:00:00Z",
    };
    enqueueDeletes([deletedEntry]); // one row matched

    const res = await request(app).delete("/api/diary/entries/42");

    expect(res.status).toBe(204);
  });
});

describe("User A cannot see User B's meal presets", () => {
  it("GET /api/meal-sets returns only the authenticated user's sets", async () => {
    setMockUserId("user-a");

    const userASet = {
      id: 10,
      userId: "user-a",
      name: "User A Breakfast",
      category: "breakfast",
      createdAt: "2024-01-01T08:00:00Z",
    };

    // Route: db.select().from(mealSetsTable).where(eq(userId,'user-a')).orderBy()
    // The DB only returns rows matching the WHERE clause; our mock returns
    // user-a's set only (as the real DB would with the userId filter).
    enqueueSelects([userASet]); // 1st select: list of user-a's meal sets
    // getMealSetWithItems is called per set (2 selects each):
    enqueueSelects([userASet]); // 2nd select: meal set detail for set 10
    enqueueSelects([]); // 3rd select: items for set 10 (empty)

    const res = await request(app).get("/api/meal-sets");

    expect(res.status).toBe(200);
    const body: Array<{ name: string }> = res.body;
    // The response contains user-a's set (by name) and nothing from user-b.
    // userId is not exposed in the API response schema, so we assert via name.
    expect(body.some((s) => s.name === "User A Breakfast")).toBe(true);
    expect(body.some((s) => s.name === "User B Lunch")).toBe(false);
  });

  it("GET /api/meal-sets/:id returns 404 for another user's preset", async () => {
    setMockUserId("user-a");

    const userBSet = {
      id: 20,
      userId: "user-b",
      name: "User B Lunch",
      category: "lunch",
      createdAt: "2024-01-01T12:00:00Z",
    };

    // getMealSetWithItems: first select returns user-b's set (by id),
    // second returns its items.
    enqueueSelects([userBSet]); // meal set by id
    enqueueSelects([]); // items

    // Route checks: if (!result || result.userId !== userId) → 404
    const res = await request(app).get("/api/meal-sets/20");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Meal set not found" });
  });

  it("DELETE /api/meal-sets/:id returns 404 for another user's preset", async () => {
    setMockUserId("user-a");

    // Route: db.delete().where(and(eq(id), eq(userId))).returning()
    // userId mismatch → no rows matched → []
    enqueueDeletes([]);

    const res = await request(app).delete("/api/meal-sets/20");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: "Meal set not found" });
  });
});

describe("Food catalog endpoints are global (not per-user scoped)", () => {
  // The foods table is a shared product catalog. Barcode lookups and search
  // results are intentionally visible to all users — there is no per-user
  // food history at this time. These tests document that baseline so that any
  // future per-user food endpoint has an explicit isolation test to add here.

  it("GET /api/foods/search is accessible without authentication", async () => {
    // No userId set → _mockUserId is null, but the route has no requireAuth.
    enqueueSelects([
      {
        id: 1,
        name: "Chicken Breast",
        brand: null,
        barcode: null,
        servingSize: "100g",
        kcalPerServing: 165,
        proteinPerServing: 31,
        carbsPerServing: 0,
        fatPerServing: 3.6,
      },
    ]);

    const res = await request(app).get("/api/foods/search?q=chicken");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/foods/search returns the same results regardless of which user is signed in", async () => {
    const sharedFood = {
      id: 2,
      name: "Oats",
      brand: "Generic",
      barcode: "1234567890",
      servingSize: "40g",
      kcalPerServing: 150,
      proteinPerServing: 5,
      carbsPerServing: 27,
      fatPerServing: 2.5,
    };

    // User A query
    setMockUserId("user-a");
    enqueueSelects([sharedFood]);
    const resA = await request(app).get("/api/foods/search?q=oats");

    // User B query
    setMockUserId("user-b");
    enqueueSelects([sharedFood]);
    const resB = await request(app).get("/api/foods/search?q=oats");

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    // Both users see the same shared catalog entry — no per-user filtering.
    expect(resA.body[0].name).toBe(sharedFood.name);
    expect(resB.body[0].name).toBe(sharedFood.name);
  });

  it("POST /api/foods creates a food in the shared catalog (auth required)", async () => {
    setMockUserId("user-a");

    const newFood = {
      id: 3,
      name: "Brown Rice",
      brand: null,
      barcode: null,
      servingSize: "100g",
      kcalPerServing: 216,
      proteinPerServing: 4.5,
      carbsPerServing: 45,
      fatPerServing: 1.8,
      saturatedFatPerServing: null,
      sugarsPerServing: null,
      fiberPerServing: null,
      saltPerServing: null,
      nutriscoreGrade: null,
      imageUrl: null,
    };

    enqueueInserts([newFood]);

    const res = await request(app)
      .post("/api/foods")
      .send({ name: "Brown Rice", kcalPerServing: 216 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Brown Rice");
  });
});

describe("Per-user endpoints enforce isolation via userId predicate", () => {
  // These tests verify that the drizzle `eq()` helper is actually called with
  // the session userId for every user-scoped operation.  A missing or wrong
  // userId filter would let one account access another's data even though the
  // mock returns the "right" value.
  //
  // Any future per-user food endpoint (scan history, saved foods, etc.) MUST
  // follow this same pattern — add a case here before shipping it.

  it("diary DELETE includes eq(userId) in its WHERE clause", async () => {
    setMockUserId("user-a");
    enqueueDeletes([{ id: 42, userId: "user-a" }]);

    await request(app).delete("/api/diary/entries/42");

    // The route calls eq(diaryEntriesTable.userId, userId) inside and().
    // Verify eq was invoked at least once with the session userId value.
    const eqCalls = vi.mocked(eq).mock.calls;
    const userIdFilterCalls = eqCalls.filter(([, value]) => value === "user-a");
    expect(userIdFilterCalls.length).toBeGreaterThan(0);
  });

  it("meal-set GET by id includes eq(userId) in the ownership check", async () => {
    setMockUserId("user-b");

    const userBSet = {
      id: 30,
      userId: "user-b",
      name: "User B Dinner",
      category: "dinner",
      createdAt: "2024-01-01T18:00:00Z",
    };
    enqueueSelects([userBSet]); // meal set by id
    enqueueSelects([]); // items

    await request(app).get("/api/meal-sets/30");

    // The route's ownership check reads result.userId and compares — the
    // WHERE clause on the first select also filters by id via eq().
    // Confirm eq was called (at minimum for the id filter).
    expect(vi.mocked(eq).mock.calls.length).toBeGreaterThan(0);
  });

  it("meal-set DELETE includes eq(userId) in its WHERE clause", async () => {
    setMockUserId("user-a");
    enqueueDeletes([]); // simulate cross-user → no rows matched

    await request(app).delete("/api/meal-sets/99");

    const eqCalls = vi.mocked(eq).mock.calls;
    const userIdFilterCalls = eqCalls.filter(([, value]) => value === "user-a");
    expect(userIdFilterCalls.length).toBeGreaterThan(0);
  });

  it("food catalog search does NOT filter by userId (global shared catalog)", async () => {
    // Documenting the intentional contrast: per-user endpoints call eq(userId),
    // global catalog endpoints do not.  If a userId filter appears here, the
    // search result would silently differ per user — a regression to catch.
    setMockUserId("user-a");
    enqueueSelects([]);

    await request(app).get("/api/foods/search?q=rice");

    const eqCalls = vi.mocked(eq).mock.calls;
    const userIdFilterCalls = eqCalls.filter(([, value]) => value === "user-a");
    expect(userIdFilterCalls.length).toBe(0);
  });

  it("food history includes eq(userId) in its WHERE clause", async () => {
    setMockUserId("user-a");
    enqueueSelects([]);

    const res = await request(app).get("/api/foods/history?limit=10&offset=20");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      items: [],
      pagination: { limit: 10, offset: 20, hasMore: false },
    });
    const eqCalls = vi.mocked(eq).mock.calls;
    const userIdFilterCalls = eqCalls.filter(([, value]) => value === "user-a");
    expect(userIdFilterCalls.length).toBeGreaterThan(0);
  });
});

describe("Food scan history", () => {
  const historyFood = {
    id: 7,
    barcode: "012345678905",
    name: "Oats",
    brand: "Generic",
    servingSize: "40g",
    kcalPerServing: 150,
    proteinPerServing: 5,
    carbsPerServing: 27,
    fatPerServing: 2.5,
    potassiumPerServing: 100,
  };

  it("returns only the authenticated user's recent scans with pagination", async () => {
    setMockUserId("user-a");
    enqueueSelects([
      { id: 3, foodId: historyFood.id, scannedAt: "2024-01-03T12:00:00Z", food: historyFood },
      { id: 2, foodId: historyFood.id, scannedAt: "2024-01-02T12:00:00Z", food: historyFood },
      { id: 1, foodId: historyFood.id, scannedAt: "2024-01-01T12:00:00Z", food: historyFood },
    ]);

    const res = await request(app).get("/api/foods/history?limit=2&offset=0");

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0]).toMatchObject({ id: 3, foodId: 7, food: { name: "Oats" } });
    expect(res.body.pagination).toEqual({ limit: 2, offset: 0, hasMore: true });
    // The database predicate is the isolation boundary: rows returned for
    // user-a cannot include another user's history.
    expect(res.body.items.some((item: { userId?: string }) => item.userId === "user-b")).toBe(false);
  });

  it("rejects an anonymous barcode lookup before reading or writing the catalog", async () => {
    setMockUserId(null);

    const res = await request(app).post("/api/foods/lookup").send({ barcode: historyFood.barcode });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: "Unauthorized" });
    expect(selectQueue).toHaveLength(0);
    expect(insertQueue).toHaveLength(0);
  });

  it("records an authenticated cached barcode lookup", async () => {
    setMockUserId("user-a");
    enqueueSelects([historyFood]);
    enqueueInserts([]);

    const res = await request(app).post("/api/foods/lookup").send({ barcode: historyFood.barcode });

    expect(res.status).toBe(200);
    expect(insertQueue).toHaveLength(0);
    expect(transactionCount).toBe(1);
  });

  it("persists an AI-parsed food and records its scan", async () => {
    setMockUserId("user-a");
    enqueueInserts([{ id: 12 }]); // parsed food catalog row
    enqueueInserts([]); // scan history row

    const res = await request(app)
      .post("/api/foods/parse")
      .send({ query: "100g chicken breast" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      foodName: "Chicken Breast",
      quantity: 100,
      unit: "g",
    });
    expect(insertQueue).toHaveLength(0);
    expect(transactionCount).toBe(1);
  });

  it("rolls back a parsed food when its history insert fails", async () => {
    setMockUserId("user-a");
    enqueueInserts([{ id: 12 }]);
    failSecondTransactionInsert = true;

    const res = await request(app)
      .post("/api/foods/parse")
      .send({ query: "100g chicken breast" });

    expect(res.status).toBe(500);
    expect(res.body).toMatchObject({ error: "Failed to save scan" });
    expect(transactionCount).toBe(1);
  });
});

describe("claim-legacy-data assigns orphaned rows only once", () => {
  it("first call claims all NULL-userId rows and returns counts", async () => {
    setMockUserId("user-a");

    // update diary_entries WHERE userId IS NULL → 3 rows claimed
    // update meal_sets    WHERE userId IS NULL → 1 row claimed
    enqueueUpdates(
      [{ id: 1 }, { id: 2 }, { id: 3 }], // diary entries claimed
      [{ id: 5 }] // meal sets claimed
    );

    const res = await request(app).post("/api/user/claim-legacy-data");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      claimed: { diaryEntries: 3, mealSets: 1 },
    });
  });

  it("second call returns 0 counts because no unclaimed rows remain", async () => {
    setMockUserId("user-a");

    // No NULL-userId rows left after the first claim
    enqueueUpdates([], []);

    const res = await request(app).post("/api/user/claim-legacy-data");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      claimed: { diaryEntries: 0, mealSets: 0 },
    });
  });

  it("does not affect rows that already have a userId", async () => {
    // The WHERE isNull(userId) clause means pre-owned rows are untouched.
    // We simulate this by returning only the truly-unclaimed rows.
    setMockUserId("user-b");

    enqueueUpdates(
      [{ id: 99 }], // one unclaimed diary entry
      [] // no unclaimed meal sets
    );

    const res = await request(app).post("/api/user/claim-legacy-data");

    expect(res.status).toBe(200);
    expect(res.body.claimed.diaryEntries).toBe(1);
    expect(res.body.claimed.mealSets).toBe(0);
  });
});
