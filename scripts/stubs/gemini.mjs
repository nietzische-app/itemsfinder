/**
 * A Gemini-shaped stub for `eval:record-attrs`.
 *
 * Same purpose as `stub-vision.mjs`: prove the script runs, that the options it
 * passes are accepted, and that what it writes can be replayed by `npm run eval`.
 * The attributes it returns are fixed nonsense — scoring against them would be
 * measuring this file.
 *
 * It also exercises the two answers a real model gives that are easy to get wrong
 * in the reader: a blocked/safety finish and an explicit `visible: false`, both of
 * which must come back as "not described" rather than as a described item with junk.
 *
 * Speaks the `generateContent` REST shape that `vlmService` uses when
 * `VLM_BASE_URL` points here.
 */
import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? 4712);
let call = 0;

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    call += 1;

    // Every seventh call is blocked; every eleventh says it cannot see the garment.
    if (call % 7 === 0) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          candidates: [
            {
              finishReason: "SAFETY",
              content: { role: "model", parts: [] },
            },
          ],
        }),
      );
      return;
    }

    const attributes =
      call % 11 === 0
        ? { visible: false }
        : {
            visible: true,
            searchQuery: "Unisex Siyah Deri Ceket Oversize",
            garmentType: "Ceket",
            colorName: "Siyah",
            colorHex: "#101010",
            material: "deri",
            pattern: "düz",
            fit: "oversize",
            details: ["fermuarlı"],
            confidence: 0.5,
          };

    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              role: "model",
              parts: [{ text: JSON.stringify(attributes) }],
            },
          },
        ],
      }),
    );
  });
});

server.listen(PORT, () => console.log(`stub-gemini :${PORT}`));
