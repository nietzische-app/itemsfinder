import { HomeClient } from "@/components/HomeClient";
import { buildShowcasePreview } from "@/services/showcasePreview";

/**
 * Server shell for the landing page.
 *
 * The showcase data is built here, on the server, from the demo catalogue — the
 * same module `/api/detect` answers from. That is what keeps the hero preview and
 * `/analyze` in agreement, and it keeps the catalogue itself out of the client
 * bundle: only the handful of rows the preview renders cross the boundary.
 */
export default function HomePage() {
  return <HomeClient looks={buildShowcasePreview()} />;
}
