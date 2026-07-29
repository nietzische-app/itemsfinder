import Link from "next/link";
import { ChevronDown } from "lucide-react";

const FAQ: Array<{ question: string; answer: React.ReactNode }> = [
  {
    question: "Markas nasıl çalışır?",
    answer: (
      <>
        Bir kombin veya makyaj ekran görüntüsü yüklüyorsun. Görsel arama motoru
        karedeki parçaları tek tek tespit edip her birinin sınırlarını işaretliyor;
        ardından bu etiketler için mağazalarda birebir eşleşme ve daha uygun fiyatlı
        muadiller aranıyor. Bir noktaya dokunduğunda o parçanın eşleşmeleri açılıyor.
      </>
    ),
  },
  {
    question: "Ürün fiyatları güncel mi?",
    answer: (
      <>
        Canlı mod açıkken fiyatlar mağaza sayfalarından o an okunur; kapalıyken
        gördüğün rakamlar örnek veridir. Her iki durumda da fiyatlar mağaza tarafında
        değişebilir — bağlayıcı olan, yönlendirildiğin mağaza sayfasındaki bilgidir.
        Ayrıntılar için{" "}
        <Link
          href="/kullanim-kosullari"
          className="font-semibold text-primary underline underline-offset-2"
        >
          Kullanım Koşulları
        </Link>
        .
      </>
    ),
  },
  {
    question: "Görsellerim kaydediliyor mu?",
    answer: (
      <>
        Hayır. Yüklediğin görsel tarayıcının oturum depolamasında tutulur ve yalnızca
        analiz isteği sırasında sunucuya gönderilir. Sunucu tarafında hiçbir yere
        kaydedilmez, veritabanına yazılmaz ve üçüncü taraflara satılmaz. Sekmeyi
        kapattığında oturum depolaması da silinir. Detaylar{" "}
        <Link
          href="/gizlilik-politikasi"
          className="font-semibold text-primary underline underline-offset-2"
        >
          Gizlilik ve Çerez Politikası
        </Link>
        &apos;nda.
      </>
    ),
  },
  {
    question: "Hangi e-ticaret sitelerinde arama yapılıyor?",
    answer: (
      <>
        Giyim ve aksesuar için Trendyol, Zara, Mango, H&amp;M, ASOS ve Amazon;
        güzellik için Sephora, Trendyol ve Amazon. Markas bu mağazaların hiçbirine ait
        değildir, satış yapmaz, ödeme almaz ve kargo süreçlerine karışmaz — yalnızca
        bağımsız muadilleri listeler.
      </>
    ),
  },
];

/**
 * FAQ accordion built on native `<details>`.
 *
 * The browser handles the open/close state, keyboard operation and screen-reader
 * semantics for free, so there is no JS state to desynchronise and the answers
 * are in the HTML for search engines to index.
 */
export function FaqSection() {
  return (
    <section id="sss" className="scroll-mt-28 border-t border-outline-variant pt-16">
      <h2 className="font-display text-headline-md text-primary">
        Sıkça sorulan sorular
      </h2>
      <p className="mt-1 max-w-xl text-on-surface-variant">
        Merak edilenler — görsellerin ne olduğu, fiyatların nereden geldiği ve hangi
        mağazalarda arandığı.
      </p>

      <div className="mt-8 max-w-3xl divide-y divide-outline-variant/60 overflow-hidden rounded-2xl border border-outline-variant/60 bg-surface-container-lowest">
        {FAQ.map((entry) => (
          <details key={entry.question} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-left transition-colors hover:bg-surface-container-low">
              <span className="font-display text-[17px] font-semibold text-primary">
                {entry.question}
              </span>
              <ChevronDown
                className="h-5 w-5 shrink-0 text-on-surface-variant transition-transform duration-300 group-open:rotate-180"
                strokeWidth={1.75}
              />
            </summary>
            <div className="px-5 pb-5 text-body-md leading-relaxed text-on-surface-variant">
              {entry.answer}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
