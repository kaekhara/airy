import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Upskill Airy — дневник роста",
    short_name: "Airy",
    description: "Твой путь к росту вместе с Микой.",
    start_url: "/upskill.html",
    display: "standalone",
    background_color: "#0b0a18",
    theme_color: "#0b0a18",
    icons: [
      {
        src: "/icons/airy-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/airy-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
