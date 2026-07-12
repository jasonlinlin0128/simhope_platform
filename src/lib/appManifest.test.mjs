import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAppManifest, isForbiddenHost } from "./appManifest.mjs";

const minimal = () => ({
  application_id: "quote-assistant",
  name: "報價小幫手",
  description: "從 RFQ 產生報價單草稿",
  production_url: "https://quote.simhope.example.com",
  owner_department: "dept-mfg",
  owner_employee_id: "10231",
  authentication_mode: "LOCAL_ACCOUNT",
});

test("最小合法 manifest 通過並套上預設值", () => {
  const r = validateAppManifest(minimal());
  assert.equal(r.ok, true);
  assert.equal(r.value.visibility, "HIDDEN");
  assert.equal(r.value.data_classification, "internal");
  assert.equal(r.value.supports_sso, false);
  assert.deepEqual(r.value.allowed_users, []);
});

test("缺必填欄位逐一報錯", () => {
  const r = validateAppManifest({});
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.startsWith("application_id:")));
  assert.ok(r.errors.some((e) => e.startsWith("production_url:")));
  assert.ok(r.errors.some((e) => e.startsWith("authentication_mode:")));
});

test("未知欄位（含 __proto__ 類 key）被拒且不進輸出", () => {
  const input = { ...minimal(), hack: 1 };
  Object.defineProperty(input, "__proto__x", { value: 1, enumerable: true });
  const r = validateAppManifest(input);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => e.includes("未知欄位")));
});

test("application_id 格式：大寫/底線/過短被拒", () => {
  for (const bad of ["Quote", "a_b", "ab", "-abc", "abc-"]) {
    const r = validateAppManifest({ ...minimal(), application_id: bad });
    assert.equal(r.ok, false, bad);
  }
});

test("URL 僅接受 https，非 URL 被拒", () => {
  assert.equal(validateAppManifest({ ...minimal(), production_url: "http://x.example.com" }).ok, false);
  assert.equal(validateAppManifest({ ...minimal(), repository_url: "not-a-url" }).ok, false);
});

test("health_check_url 擋內網/本機位址", () => {
  for (const bad of [
    "https://localhost/health",
    "https://127.0.0.1/health",
    "https://10.0.0.5/health",
    "https://172.20.1.1/health",
    "https://192.168.1.1/health",
    "https://app.internal/health",
  ]) {
    const r = validateAppManifest({ ...minimal(), health_check_url: bad });
    assert.equal(r.ok, false, bad);
  }
  assert.equal(
    validateAppManifest({ ...minimal(), health_check_url: "https://quote.simhope.example.com/api/health" }).ok,
    true,
  );
});

test("enum 欄位驗證", () => {
  assert.equal(validateAppManifest({ ...minimal(), authentication_mode: "PASSWORD" }).ok, false);
  assert.equal(validateAppManifest({ ...minimal(), visibility: "SECRET" }).ok, false);
  assert.equal(validateAppManifest({ ...minimal(), data_classification: "top" }).ok, false);
});

test("陣列欄位：非字串項與超量被拒", () => {
  assert.equal(validateAppManifest({ ...minimal(), allowed_users: [123] }).ok, false);
  assert.equal(
    validateAppManifest({ ...minimal(), allowed_roles: Array.from({ length: 101 }, (_, i) => `r${i}`) }).ok,
    false,
  );
});

test("超長字串被拒", () => {
  assert.equal(validateAppManifest({ ...minimal(), description: "x".repeat(2001) }).ok, false);
});

test("非物件輸入安全拒絕", () => {
  for (const bad of [null, "yaml", 42, ["a"]]) {
    assert.equal(validateAppManifest(bad).ok, false);
  }
});

test("isForbiddenHost 邊界：公網 IP 與一般網域放行", () => {
  assert.equal(isForbiddenHost("8.8.8.8"), false);
  assert.equal(isForbiddenHost("172.32.0.1"), false);
  assert.equal(isForbiddenHost("quote.simhope.example.com"), false);
  assert.equal(isForbiddenHost("169.254.1.1"), true);
});

test("isForbiddenHost：trailing dot 與 IPv6 字面值不可繞過", () => {
  assert.equal(isForbiddenHost("localhost."), true);
  assert.equal(isForbiddenHost("app.internal."), true);
  assert.equal(isForbiddenHost("foo.local."), true);
  assert.equal(isForbiddenHost("[::1]"), true);
  assert.equal(isForbiddenHost("[::ffff:7f00:1]"), true); // ::ffff:127.0.0.1 經 URL 正規化後的形態
  assert.equal(isForbiddenHost("[2001:db8::1]"), true); // IPv6 一律拒（fail-closed）
  assert.equal(isForbiddenHost("quote.simhope.example.com."), false); // 一般網域帶點仍放行
});
