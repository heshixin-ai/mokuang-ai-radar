import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.PUBLIC_SITE_URL ?? "http://localhost:3000";
  if (process.env.INVITE_ACCESS_MODE === "enforced") {
    return { rules: { userAgent: "*", disallow: "/" }, sitemap: `${base.replace(/\/$/, "")}/sitemap.xml` };
  }
  return { rules: { userAgent: "*", allow: "/", disallow: ["/review", "/api/v1/admin"] }, sitemap: `${base.replace(/\/$/, "")}/sitemap.xml` };
}
