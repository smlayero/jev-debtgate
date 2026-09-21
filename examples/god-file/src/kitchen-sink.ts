/**
 * Intentionally mixed-responsibility module for debtgate demos.
 * Not production code.
 */
import express from "express";
import { Pool } from "pg";
import Stripe from "stripe";
import { Queue } from "bullmq";

const app = express();
const db = new Pool();
const stripe = new Stripe("sk_test_x");
const mailQ = new Queue("mail");

export async function handleCheckout(req: express.Request, res: express.Response) {
  const { userId, sku } = req.body;
  const user = await db.query("select * from users where id = $1", [userId]);
  const charge = await stripe.charges.create({ amount: 999, currency: "usd" });
  await db.query("insert into orders(user_id, sku, charge) values ($1,$2,$3)", [
    userId,
    sku,
    charge.id,
  ]);
  res.json({ ok: true, user, charge });
}

export function renderInvoiceHtml(order: { total: number; email: string }): string {
  return `<html><body>Invoice ${order.total} for ${order.email}</body></html>`;
}

export async function sendSlack(text: string): Promise<void> {
  await fetch("https://hooks.slack.com/services/x", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export async function enqueueWelcomeEmail(email: string): Promise<void> {
  await mailQ.add("welcome", { email });
}

export function parseWebhook(raw: string): unknown {
  return JSON.parse(raw);
}

app.post("/checkout", handleCheckout);
app.get("/invoice", (_req, res) => {
  res.send(renderInvoiceHtml({ total: 10, email: "a@b.c" }));
});

export { app, db, stripe };
