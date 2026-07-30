/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    /*
     * Allowlist for remote product imagery.
     *
     * Scope note, so this does not read as a fix it is not: `remotePatterns`
     * only governs `next/image`. Every image in this app is a plain `<img>`
     * (see `ProductImage.tsx`), which the browser fetches directly and which
     * needs no allowlist — so nothing here changes today's rendering. What
     * actually makes retailer thumbnails load is `referrerPolicy="no-referrer"`
     * on the tag, since hotlink protection keys off the Referer header.
     *
     * Retailer CDNs are deliberately not routed through the optimizer: they
     * rate-limit, rotate URLs and block hotlinking, and each of those becomes a
     * 500 from the optimizer instead of a missing thumbnail we can catch with
     * `onError` and replace with a placeholder. The list is here so a future
     * component that does want `next/image` is not blocked on config, and so the
     * hosts we expect imagery from are written down.
     */
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      // Trendyol
      { protocol: "https", hostname: "cdn.dsmcdn.com" },
      { protocol: "https", hostname: "**.dsmcdn.com" },
      // Zara
      { protocol: "https", hostname: "static.zara.net" },
      // Amazon
      { protocol: "https", hostname: "m.media-amazon.com" },
      { protocol: "https", hostname: "images-eu.ssl-images-amazon.com" },
      // Sephora
      { protocol: "https", hostname: "**.sephora.com" },
      { protocol: "https", hostname: "**.sephora.com.tr" },
      // The remaining merchants we list, so the allowlist matches the catalogue
      { protocol: "https", hostname: "**.mngbcn.com" },
      { protocol: "https", hostname: "**.hm.com" },
      { protocol: "https", hostname: "**.asos-media.com" },
    ],
  },
};

export default nextConfig;
