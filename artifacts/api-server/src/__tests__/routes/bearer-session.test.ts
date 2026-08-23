import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import session from "express-session";
import request from "supertest";
import { bearerSession, registerSessionStore } from "../../middlewares/bearer-session";

describe("bearerSession middleware", () => {
  const store = new session.MemoryStore();

  const app = express();
  app.use(session({ store, secret: "test-secret", resave: false, saveUninitialized: false }));
  app.use(bearerSession);
  app.get("/api/protected", (req, res) => {
    if (!req.session.employeeId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({ employeeId: req.session.employeeId, role: req.session.role });
  });

  beforeAll(async () => {
    registerSessionStore(store);
    await new Promise<void>((resolve, reject) => {
      store.set("good-sid", { cookie: {}, employeeId: 7, role: "admin" } as never, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  });

  it("rejects requests with no credentials", async () => {
    const res = await request(app).get("/api/protected");
    expect(res.status).toBe(401);
  });

  it("authenticates via Authorization: Bearer <sid>", async () => {
    const res = await request(app)
      .get("/api/protected")
      .set("Authorization", "Bearer good-sid");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ employeeId: 7, role: "admin" });
  });

  it("authenticates via ?sid= (EventSource path)", async () => {
    const res = await request(app).get("/api/protected?sid=good-sid");
    expect(res.status).toBe(200);
    expect(res.body.employeeId).toBe(7);
  });

  it("rejects an unknown session id", async () => {
    const res = await request(app)
      .get("/api/protected")
      .set("Authorization", "Bearer nope-sid");
    expect(res.status).toBe(401);
  });

  it("rejects a session without an employeeId", async () => {
    await new Promise<void>((resolve, reject) => {
      store.set("anon-sid", { cookie: {} } as never, (err) => (err ? reject(err) : resolve()));
    });
    const res = await request(app)
      .get("/api/protected")
      .set("Authorization", "Bearer anon-sid");
    expect(res.status).toBe(401);
  });
});
