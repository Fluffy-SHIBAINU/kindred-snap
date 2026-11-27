import type { MetadataRoute } from "next";

/** Each /sample visit writes a private walk case, and case pages are per visitor: crawlers are kept off both, and off staff. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: ["/sample", "/case/", "/staff"] } };
}
