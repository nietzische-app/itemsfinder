/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Merchant product imagery is served from remote CDNs. Add hosts here as
    // real retailer integrations land; the mock catalogue uses local SVGs.
    remotePatterns: [],
  },
};

export default nextConfig;
