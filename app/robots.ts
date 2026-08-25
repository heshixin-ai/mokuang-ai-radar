import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.PUBLIC_SITE_URL ?? "http://localhost:3000";
  return { rules: { userAgent: "*", allow: "/", disallow: ["/review", "/api/v1/admin"] }, sitemap: `${base.replace(/\/$/, "")}/sitemap.xml` };
}
