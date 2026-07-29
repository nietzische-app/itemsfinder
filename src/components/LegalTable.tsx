/**
 * Horizontal-scroll wrapper for the tables in the legal documents.
 *
 * A four-column table does not fit 390px, and letting it overflow makes the
 * whole page scroll sideways. Scrolling the table inside its own box keeps the
 * data intact — abbreviating a KVKK disclosure to fit is not an option — while
 * the page body stays put.
 */
export function LegalTable({ children }: { children: React.ReactNode }) {
  return (
    <div
      // `tabIndex` so a scrollable region is reachable by keyboard.
      tabIndex={0}
      role="group"
      className="-mx-1 mt-4 overflow-x-auto px-1 [&_table]:!mt-0 [&_td]:whitespace-nowrap [&_td:last-child]:whitespace-normal"
    >
      {children}
    </div>
  );
}
