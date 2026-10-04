import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// Lets phones "Add to home screen" and open ShareKhabar like an app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${BRAND.name} – PSX news in English and Urdu`,
    short_name: BRAND.name,
    description: BRAND.tagline,
    start_url: "/",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f766e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
