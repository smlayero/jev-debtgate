import { chargeOrder } from "./checkout.js";

test("checkout eventually succeeds", async () => {
  await chargeOrder("ord_1");
}, 5000);
