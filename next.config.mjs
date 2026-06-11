const securityHeaders = [
  // 強制 HTTPS（2 年，含子網域，可進 preload list）
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // 擋 MIME sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // 防別站 iframe 我方頁面（clickjacking）；不影響我方嵌 YouTube
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // 跨站只送 origin
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // 關不用的強功能；明確保留 passkey（WebAuthn），不碰 YouTube 要的 autoplay/fullscreen 等
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(), browsing-topics=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
