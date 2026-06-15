import { ImageResponse } from "next/og";
import { WHITE_MARK_DATA_URI, BRAND_GRADIENT } from "@/lib/brandMark.mjs";

const ALLOWED = new Set([192, 512]);

// GET /icons/192 或 /icons/512 → 品牌 PWA icon（白 mark 於漸層底，maskable 安全區留白）。
// 只渲染 SVG <img>、無文字 → ImageResponse 不需 fonts。
export async function GET(request, { params }) {
  const { size: sizeParam } = await params;
  const n = Number(sizeParam);
  const size = ALLOWED.has(n) ? n : 512;
  const mark = Math.round(size * 0.64);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: BRAND_GRADIENT,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse(Satori) 只支援 <img>，不能用 next/image */}
      <img width={mark} height={mark} src={WHITE_MARK_DATA_URI} alt="" />
    </div>,
    { width: size, height: size },
  );
}
