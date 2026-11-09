import { ImageResponse } from "next/og";
import {
  MAIPO_COLORS,
  MAIPO_FULL_VIEWBOX,
  maipoShapes,
  viewBoxAttr,
} from "@/lib/brand/maipo-mark";

/**
 * Cartão Open Graph compartilhado pelas páginas de marketing. Satori só
 * suporta flexbox e um subconjunto de CSS: sem grid, e todo container
 * precisa de `display: flex` explícito.
 */
export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

const LOGO_HEIGHT = 44;
const fullBox = MAIPO_FULL_VIEWBOX;

export function renderOgImage({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead: string;
}) {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: "#0a1130",
          backgroundImage:
            "linear-gradient(135deg, #0a1130 0%, #141f52 55%, #1b2d6f 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brilho decorativo no canto */}
        <div
          style={{
            position: "absolute",
            top: -160,
            right: -120,
            width: 480,
            height: 480,
            borderRadius: 9999,
            backgroundColor: "rgba(190, 203, 211, 0.12)",
            display: "flex",
          }}
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              padding: "10px 22px",
              borderRadius: 9999,
              border: "1px solid rgba(190, 203, 211, 0.35)",
              backgroundColor: "rgba(190, 203, 211, 0.12)",
              color: MAIPO_COLORS.mist,
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            {eyebrow}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 40,
              fontSize: title.length > 60 ? 62 : 74,
              fontWeight: 700,
              lineHeight: 1.08,
              letterSpacing: -2,
              maxWidth: 940,
            }}
          >
            {title}
          </div>

          <div
            style={{
              display: "flex",
              marginTop: 28,
              fontSize: 30,
              lineHeight: 1.4,
              color: "rgba(255, 255, 255, 0.72)",
              maxWidth: 880,
            }}
          >
            {lead}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(255, 255, 255, 0.14)",
            paddingTop: 32,
          }}
        >
          {/* Logo Maipo em versão negativa (Satori renderiza <svg> inline). */}
          <svg
            width={LOGO_HEIGHT * (fullBox.width / fullBox.height)}
            height={LOGO_HEIGHT}
            viewBox={viewBoxAttr(fullBox)}
          >
            {maipoShapes("full").map((shape, i) => (
              <path
                key={i}
                d={shape.d}
                fill={shape.tone === "primary" ? "#ffffff" : MAIPO_COLORS.mist}
              />
            ))}
          </svg>
          <div
            style={{
              display: "flex",
              fontSize: 24,
              color: "rgba(255, 255, 255, 0.55)",
            }}
          >
            Painel para vendedores Mercado Livre
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
