import assert from "node:assert/strict";
import { telegramPaymentRequestId } from "../payment-request-id.js";

const first = telegramPaymentRequestId(123456, "update-77");
const retry = telegramPaymentRequestId(123456, "update-77");
const anotherEvent = telegramPaymentRequestId(123456, "update-78");
const anotherUser = telegramPaymentRequestId(654321, "update-77");

assert.equal(first, retry, "the same Telegram action must reuse one YooKassa request id");
assert.match(
  first,
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/
);
assert.notEqual(first, anotherEvent);
assert.notEqual(first, anotherUser);

console.log("payment request id PASS: stable retry and action isolation");
