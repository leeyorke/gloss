import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["linkedom"],
  poweredByHeader: false,
  experimental: {
    // The root layout lives under [lang], so a URL that matches no page at all
    // needs a 404 of its own, drawn outside that layout.
    globalNotFound: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
