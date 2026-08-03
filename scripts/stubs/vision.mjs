/**
 * A Vision-shaped stub, so `eval:record` can be driven end to end without a key.
 *
 * It is NOT a substitute for the real capture — the boxes it returns are derived
 * from the ground truth, so scoring against them would be scoring the eval against
 * itself. Its only job is to prove the script runs, writes the file, and that
 * `npm run eval` can replay what it wrote.
 */
import { createServer } from "node:http";

const PORT = Number(process.argv[2] ?? 4711);

const OBJECTS = [
  { name: "Outerwear", score: 0.94, box: [0.22, 0.2, 0.62, 0.55] },
  { name: "Shorts", score: 0.88, box: [0.3, 0.55, 0.42, 0.72] },
  { name: "Footwear", score: 0.81, box: [0.32, 0.86, 0.46, 0.96] },
];

/*
 * `FAIL=1` ile başlatıldığında her isteğe 500 dönüyor.
 *
 * Amaç, dedektör çöktüğünde uygulamanın hata vermek yerine kataloğa düşmesini
 * sürebilmek. O davranış tasarımın en kritik parçalarından biri ve sürmenin tek
 * yolu gerçek bir Vision kesintisi beklemekti.
 */
const ALWAYS_FAIL = process.env.FAIL === "1";

const server = createServer((req, res) => {
  if (ALWAYS_FAIL) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { code: 500, message: "stub outage" } }));
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const payload = {
      responses: [
        {
          localizedObjectAnnotations: OBJECTS.map((object) => ({
            name: object.name,
            score: object.score,
            boundingPoly: {
              normalizedVertices: [
                { x: object.box[0], y: object.box[1] },
                { x: object.box[2], y: object.box[1] },
                { x: object.box[2], y: object.box[3] },
                { x: object.box[0], y: object.box[3] },
              ],
            },
          })),
          webDetection: {
            webEntities: [{ description: "fashion", score: 0.7 }],
            bestGuessLabels: [{ label: "outfit" }],
          },
          imagePropertiesAnnotation: {
            dominantColors: { colors: [{ color: { red: 20, green: 20, blue: 24 }, score: 0.4, pixelFraction: 0.3 }] },
          },
        },
      ],
    };
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(payload));
  });
});

server.listen(PORT, () => console.log(`stub-vision :${PORT}`));
