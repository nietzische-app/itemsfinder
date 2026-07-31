/**
 * An Anthropic-shaped stub for `eval:record-attrs`.
 *
 * Same purpose as `stub-vision.mjs`: prove the script runs, that the SDK options
 * it passes are accepted, and that what it writes can be replayed by `npm run
 * eval`. The attributes it returns are fixed nonsense — scoring against them
 * would be measuring this file.
 *
 * It also exercises the two answers a real model gives that are easy to get wrong
 * in the reader: a refusal (`stop_reason: "refusal"`) and an explicit
 * `visible: false`, both of which must come back as "not described" rather than
 * as a described item with junk in it.
 */
import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? 4712);
let call = 0;

const server = createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    call += 1;

    // Every seventh call refuses, every eleventh says it cannot see the garment.
    if (call % 7 === 0) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: `msg_stub_${call}`,
          type: "message",
          role: "assistant",
          model: "stub",
          content: [],
          stop_reason: "refusal",
          stop_details: { explanation: "stub refusal" },
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      );
      return;
    }

    const attributes =
      call % 11 === 0
        ? { visible: false }
        : {
            visible: true,
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
        id: `msg_stub_${call}`,
        type: "message",
        role: "assistant",
        model: "stub",
        content: [{ type: "text", text: JSON.stringify(attributes) }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
  });
});

server.listen(PORT, () => console.log(`stub-anthropic :${PORT}`));
