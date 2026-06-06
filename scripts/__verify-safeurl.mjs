// scripts/__verify-safeurl.mjs — 純函式 sanity check
import assert from "node:assert";
import { isSafeHttpUrl } from "../src/lib/safeUrl.js";

// 安全：公開 http/https
assert.equal(isSafeHttpUrl("https://github.com/a/b"), true);
assert.equal(isSafeHttpUrl("http://example.com/x"), true);
// 非 http(s) scheme
assert.equal(isSafeHttpUrl("file:///etc/passwd"), false);
assert.equal(isSafeHttpUrl("ftp://example.com"), false);
assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
// 內網 / loopback / link-local
assert.equal(isSafeHttpUrl("http://localhost/x"), false);
assert.equal(isSafeHttpUrl("http://127.0.0.1/x"), false);
assert.equal(isSafeHttpUrl("http://10.0.0.5/x"), false);
assert.equal(isSafeHttpUrl("http://192.168.1.1/x"), false);
assert.equal(isSafeHttpUrl("http://172.16.0.1/x"), false);
assert.equal(isSafeHttpUrl("http://169.254.169.254/latest/meta-data"), false); // 雲端 metadata
assert.equal(isSafeHttpUrl("http://[::1]/x"), false);
assert.equal(isSafeHttpUrl("http://intranet/x"), false); // 純主機名
assert.equal(isSafeHttpUrl("http://printer.local/x"), false);
// 垃圾輸入
assert.equal(isSafeHttpUrl(""), false);
assert.equal(isSafeHttpUrl("not a url"), false);

console.log("✅ safeUrl verify passed");
