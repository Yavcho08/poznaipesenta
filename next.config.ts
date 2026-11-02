import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Значката „N“ в режим за разработка застъпва долната лента с табове на телефон.
  devIndicators: false,
  experimental: {
    // Вграденият MCP сървър за AI агенти пише конзолата на браузъра в .next/dev/logs при всяко
    // зареждане. На тази машина dev сървърът приема записа за промяна → безкраен цикъл на
    // презареждане ("Compiled in 1ms" след всяка заявка). Не го ползваме.
    mcpServer: false,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
