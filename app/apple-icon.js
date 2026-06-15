import { ImageResponse } from "next/og";
import { WHITE_MARK_DATA_URI, BRAND_GRADIENT } from "@/lib/brandMark.mjs";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS 加入主畫面的 icon（Next 自動加 apple-touch-icon link）。
export default function AppleIcon() {
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
      <img width={115} height={115} src={WHITE_MARK_DATA_URI} alt="" />
    </div>,
    { ...size },
  );
}
