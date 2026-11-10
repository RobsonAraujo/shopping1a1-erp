import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
] as const;

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // A página nasceu como "Rotina". Temporário (307): o nome ainda pode mudar,
      // e um 308 ficaria preso no cache do navegador.
      {
        source: "/dashboard/rotina",
        destination: "/dashboard/central-anuncios",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [{ source: "/:path*", headers: [...securityHeaders] }];
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "http2.mlstatic.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "http2.mlstatic.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "*.mlstatic.com",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
