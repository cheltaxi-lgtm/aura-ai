import assert from "node:assert/strict";
import {
  ACCOUNT_DELETED_HOME_KEY,
  ACCOUNT_DELETED_HOME_MAX_AGE_MS,
  consumeAccountDeletedHomeArrival,
  homeUrlAfterAccountDeletion,
  markAccountDeletedHome,
  redirectHomeAfterAccountDeletion,
} from "../src/lib/account-deleted";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const storage = new MemoryStorage();
let pathname = "/";
let replacedWith: string | null = null;

Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: storage,
});
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    location: {
      get pathname() {
        return pathname;
      },
      replace(target: string) {
        replacedWith = target;
      },
    },
  },
});

const createdAt = 10_000;
assert.equal(markAccountDeletedHome(createdAt), true);
const initialMarker = storage.getItem(ACCOUNT_DELETED_HOME_KEY);
assert.deepEqual(JSON.parse(initialMarker ?? ""), { v: 1, createdAt });
assert.equal(markAccountDeletedHome(createdAt + 1_000), false);
assert.equal(storage.getItem(ACCOUNT_DELETED_HOME_KEY), initialMarker);

assert.equal(redirectHomeAfterAccountDeletion(), false, "synthetic old timestamp is expired");
assert.equal(storage.getItem(ACCOUNT_DELETED_HOME_KEY), null);

assert.equal(markAccountDeletedHome(), true);
storage.setItem("zovus_app_shell", "1");
assert.equal(homeUrlAfterAccountDeletion(), "/?app=1");
assert.equal(redirectHomeAfterAccountDeletion(), true);
assert.equal(replacedWith, "/?app=1");
assert.notEqual(storage.getItem(ACCOUNT_DELETED_HOME_KEY), null, "redirect must not consume");

pathname = "/auth/user/login";
assert.equal(consumeAccountDeletedHomeArrival(), false);
assert.notEqual(storage.getItem(ACCOUNT_DELETED_HOME_KEY), null);

pathname = "/";
assert.equal(consumeAccountDeletedHomeArrival(), true);
assert.equal(storage.getItem(ACCOUNT_DELETED_HOME_KEY), null);
assert.equal(consumeAccountDeletedHomeArrival(), false, "arrival consumption is one-shot");

storage.removeItem("zovus_app_shell");
assert.equal(homeUrlAfterAccountDeletion(), "/");

assert.equal(markAccountDeletedHome(createdAt), true);
assert.equal(
  consumeAccountDeletedHomeArrival(createdAt + ACCOUNT_DELETED_HOME_MAX_AGE_MS + 1),
  false
);
assert.equal(storage.getItem(ACCOUNT_DELETED_HOME_KEY), null, "expired marker is cleaned up");

storage.setItem(ACCOUNT_DELETED_HOME_KEY, "1");
assert.equal(redirectHomeAfterAccountDeletion(), false);
assert.equal(storage.getItem(ACCOUNT_DELETED_HOME_KEY), null, "legacy marker is cleaned up");

console.log("Account-deletion redirect marker checks passed.");
