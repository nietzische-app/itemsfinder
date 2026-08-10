/**
 * Dizin çıkarma ağacı doğru geziliyor mu? — `node scripts/stubs/index-build-check.mjs`
 *
 * `productSitemaps` bir mağazanın sitemap ağacını gezip ürün dosyalarını
 * topluyor, ve verdiği kararların hepsi ağsız ölçülebilir: yaprak mı dizin mi,
 * bütçe nerede biter, aynı dosya iki kez indirilir mi, kaç kademe inilir.
 *
 * Ağsız ölçülebilmesinin sebebi `fetcher`ın dışarıdan verilmesi. Gerçek
 * mağazalara karşı koşan ölçüm ayrı (`npm run check:sitemap`) ve o başka bir
 * soruyu cevaplıyor — «mağaza veri merkezi IP'sine ne yapıyor». Burada
 * ölçülen şey ağ değil **gezinme**.
 *
 * Bu ayrım bir kez pahalıya mal oldu: sitemap ölçümünün dört koşusunun ikisi
 * gezinme kusuruydu (tek kademe iniş, `<urlset>` etiketli dizin), ve ikisi de
 * ancak gerçek bir mağazaya gidip görülebildi. Ağsız ölçülebilen bir kusur
 * için Actions koşusu beklemek, turu iki katına çıkarıyor.
 */
import { productSitemaps } from "../sitemapFetch.mjs";
import { keepsPrevious } from "../indexFile.mjs";

let pass = 0;
const fails = [];
const t = (c, n) => (c ? pass++ : fails.push(n));

const index = (...urls) =>
  `<?xml version="1.0"?><sitemapindex>${urls
    .map((u) => `<sitemap><loc>${u}</loc></sitemap>`)
    .join("")}</sitemapindex>`;

const urlset = (...urls) =>
  `<?xml version="1.0"?><urlset>${urls.map((u) => `<url><loc>${u}</loc></url>`).join("")}</urlset>`;

/** Sahte ağ: adres → gövde. Kaç kez sorulduğu da sayılıyor. */
function network(tree) {
  const asked = [];
  return {
    asked,
    fetcher: async (url) => {
      asked.push(url);
      const body = tree[url];
      return body === undefined ? { status: 404, body: "", url } : { status: 200, body, url };
    },
  };
}

const P = "https://x.com/urun";

/*
 * 1) İlk çocukta durmuyor — dizin çıkarmanın bütün sebebi bu.
 *
 * `check-sitemap.mjs` her kademede yalnızca `children[0]`'ı iniyor, çünkü orada
 * soru «ürün adresi var mı». Burada soru «kaç tane var»: kardeş dosyalar
 * atlanırsa dizin bir mağazanın küçük bir dilimi olur ve bunu sayıdan anlamanın
 * yolu yoktur.
 */
{
  const { fetcher } = network({
    "https://x.com/sitemap.xml": index(`${P}1.xml`, `${P}2.xml`, `${P}3.xml`),
    [`${P}1.xml`]: urlset("https://x.com/a-p-1"),
    [`${P}2.xml`]: urlset("https://x.com/b-p-2"),
    [`${P}3.xml`]: urlset("https://x.com/c-p-3"),
  });

  const { leaves } = await productSitemaps(["https://x.com/sitemap.xml"], 10, fetcher);
  t(leaves.length === 3, `üç kardeş dosyanın üçü de okundu (${leaves.length})`);
  t(
    leaves.flatMap((leaf) => leaf.locs).length === 3,
    "adresler yapraklardan toplanıyor",
  );
}

/*
 * 2) Bütçe yaprakta biter, indirmede değil.
 *
 * Bütçe indirme sayısına bağlansaydı, derin bir ağaçta bütün bütçe dizin
 * dosyalarına gider ve elde tek ürün dosyası kalmazdı — «bütçe doldu» diyen
 * ama hiçbir şey toplamamış bir koşu.
 */
{
  const { fetcher, asked } = network({
    "https://x.com/sitemap.xml": index(`${P}1.xml`, `${P}2.xml`, `${P}3.xml`),
    [`${P}1.xml`]: urlset("https://x.com/a-p-1"),
    [`${P}2.xml`]: urlset("https://x.com/b-p-2"),
    [`${P}3.xml`]: urlset("https://x.com/c-p-3"),
  });

  const { leaves } = await productSitemaps(["https://x.com/sitemap.xml"], 2, fetcher);
  t(leaves.length === 2, `bütçe iki yaprakta duruyor (${leaves.length})`);
  t(!asked.includes(`${P}3.xml`), "bütçe dolunca üçüncü dosya indirilmiyor");
}

/*
 * 3) Genişlik öncelikli: bütçe ilk dalın altında tükenmiyor.
 *
 * Derinlik öncelikli olsaydı `a` dalının üç dosyası bütçeyi bitirir ve `b`
 * dalına hiç bakılmazdı. Bir mağazanın ürünleri dallara bölünmüşse (kadın /
 * erkek / çocuk), bu dizinin tek bir bölümden ibaret olması demek.
 */
{
  const { fetcher } = network({
    "https://x.com/sitemap.xml": index("https://x.com/urun-a.xml", "https://x.com/urun-b.xml"),
    "https://x.com/urun-a.xml": index(`${P}a1.xml`, `${P}a2.xml`),
    "https://x.com/urun-b.xml": index(`${P}b1.xml`, `${P}b2.xml`),
    [`${P}a1.xml`]: urlset("https://x.com/a1-p-1"),
    [`${P}a2.xml`]: urlset("https://x.com/a2-p-2"),
    [`${P}b1.xml`]: urlset("https://x.com/b1-p-3"),
    [`${P}b2.xml`]: urlset("https://x.com/b2-p-4"),
  });

  const { leaves } = await productSitemaps(["https://x.com/sitemap.xml"], 2, fetcher);
  const dallar = new Set(leaves.map((leaf) => (leaf.url.includes("a") ? "a" : "b")));
  t(dallar.size === 2, `iki dal da temsil ediliyor (${[...dallar].join(",")})`);
}

/*
 * 4) `<urlset>` etiketli dizin de dizin sayılıyor.
 *
 * Üçüncü koşuda gerçek bir mağazada görüldü: dosya `<urlset>` diyor ama içindeki
 * adresler `.xml` uzantılı, yani aslında bir liste. Etikete güvenmek o mağazayı
 * «bir yaprak, sıfır ürün» diye okurdu.
 */
{
  const { fetcher } = network({
    "https://x.com/sitemap.xml": urlset(`${P}1.xml`, `${P}2.xml`),
    [`${P}1.xml`]: urlset("https://x.com/a-p-1"),
    [`${P}2.xml`]: urlset("https://x.com/b-p-2"),
  });

  const { leaves } = await productSitemaps(["https://x.com/sitemap.xml"], 10, fetcher);
  t(leaves.length === 2, `uzantıya bakılarak inildi (${leaves.length})`);
  t(
    !leaves.some((leaf) => leaf.url.endsWith("/sitemap.xml")),
    "dizinin kendisi yaprak sayılmıyor",
  );
}

/*
 * 5) Aynı dosya iki kez indirilmiyor.
 *
 * Mağazalar aynı ürün dosyasını birden çok dizinde ilan edebiliyor. Tekrar
 * hem bütçeyi hem mağazanın sabrını boşa harcar.
 */
{
  const { fetcher, asked } = network({
    "https://x.com/sitemap.xml": index("https://x.com/a.xml", "https://x.com/b.xml"),
    "https://x.com/a.xml": index(`${P}1.xml`),
    "https://x.com/b.xml": index(`${P}1.xml`),
    [`${P}1.xml`]: urlset("https://x.com/a-p-1"),
  });

  await productSitemaps(["https://x.com/sitemap.xml"], 10, fetcher);
  const kez = asked.filter((url) => url === `${P}1.xml`).length;
  t(kez === 1, `tekrarlanan dosya bir kez indiriliyor (${kez})`);
}

/*
 * 6) Derinlik tavanı: sonsuz dizin zinciri koşuyu kilitlemiyor.
 *
 * Kendine işaret eden bir dizin tekrar süzgeciyle zaten duruyor; tavanın
 * kapattığı şey **her seferinde yeni adres üreten** bir zincir.
 */
{
  const tree = { "https://x.com/sitemap.xml": index(`${P}0.xml`) };
  for (let i = 0; i < 8; i += 1) tree[`${P}${i}.xml`] = index(`${P}${i + 1}.xml`);

  const { fetcher, asked } = network(tree);
  const { leaves } = await productSitemaps(["https://x.com/sitemap.xml"], 10, fetcher);

  t(leaves.length === 0, `yaprağa varılmadı (${leaves.length})`);
  t(asked.length <= 5, `iniş tavanda duruyor (${asked.length} indirme)`);
}

/*
 * 7) Ulaşılamayan dosya koşuyu durdurmuyor.
 *
 * Bir mağazanın bir dosyası 403 verdiğinde ötekiler yine toplanmalı: kanalın
 * tamamı tek dosyaya bağlı olamaz.
 */
{
  const { fetcher } = network({
    "https://x.com/sitemap.xml": index(`${P}1.xml`, `${P}2.xml`),
    [`${P}2.xml`]: urlset("https://x.com/b-p-2"),
  });

  const { leaves, fetched } = await productSitemaps(["https://x.com/sitemap.xml"], 10, fetcher);
  t(leaves.length === 1, `ulaşılan dosya toplandı (${leaves.length})`);
  t(fetched === 3, `başarısız istek de sayılıyor (${fetched})`);
}

/*
 * 8) Açılamayan dosyalar sayılıyor — sıfırın sebebi yazılabilsin diye.
 *
 * Koşu bunu zorunlu kıldı: Gratis bir koşuda 13.233 ürün yolu verdi, sonrakinde
 * `7 dosya → 1258 adres → 0 ürün yolu`. Sayıdan okunabilen tek şey sıfır
 * olduğuydu, oysa sebebi üç ayrı iş: dosyalar mı açılmadı, açılanlar ürün
 * dosyası değil miydi, adresler süzgeçten mi düştü. Teşhis satırı ancak
 * gezinme başarısızlıkları dışarı verdiği için yazılabiliyor.
 */
{
  const { fetcher } = network({
    "https://x.com/sitemap.xml": index(`${P}1.xml`, `${P}2.xml`),
    [`${P}2.xml`]: urlset("https://x.com/b-p-2"),
  });

  const { failures } = await productSitemaps(["https://x.com/sitemap.xml"], 10, fetcher);
  t(failures.length === 1, `açılamayan dosya sayılıyor (${failures.length})`);
  t(failures[0]?.url === `${P}1.xml`, `hangi dosya olduğu yazılıyor (${failures[0]?.url})`);
  t(/404/.test(failures[0]?.why ?? ""), `sebebi taşınıyor (${failures[0]?.why})`);
}

/*
 * 9) Boş sonuç, dolu dosyanın üstüne yazılmıyor.
 *
 * Asıl tehlike bu. Gratis'in sıfırı dosyaya yazıldı; dizin depoya konduğunda
 * aynı şey, geçici bir mağaza arızasının on üç bin çalışan adresi **silmesi**
 * demek — ve periyodik bir iş bunu gece yarısı sessizce yapar.
 *
 * `build-index.mjs`'in kararı burada ayrıca ölçülüyor çünkü betiğin kendisi ağa
 * gidiyor. Ölçülen şey kural: dolu dosya + sıfır sonuç → dosya korunur; dolu
 * dosya + dolu sonuç → yazılır; boş dosya + sıfır sonuç → yazılır.
 */
{
  t(keepsPrevious("/a-p-1\n/b-p-2\n", 0), "dolu dosya sıfır sonuçta korunuyor");
  t(!keepsPrevious("/a-p-1\n/b-p-2\n", 5), "dolu sonuç yazılıyor");
  t(!keepsPrevious("", 0), "boş dosya sıfır sonuçta yazılıyor — korunacak bir şey yok");
  t(!keepsPrevious("\n  \n", 0), "yalnızca boşluk taşıyan dosya korunmuyor");
}

console.log(`${pass} ✓ / ${fails.length} ✗`);
for (const f of fails) console.log(`  ✗ ${f}`);
process.exit(fails.length ? 1 : 0);
