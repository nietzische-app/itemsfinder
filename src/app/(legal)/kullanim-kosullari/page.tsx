import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kullanım Koşulları — Markas",
  description:
    "Markas görsel arama hizmetinin kullanım koşulları, affiliate bildirimi ve fiyat doğruluğu hakkında bilgilendirme.",
};

const UPDATED = "29 Temmuz 2026";

export default function TermsPage() {
  return (
    <>
      <h1>Kullanım Koşulları</h1>
      <p className="!text-outline">Son güncelleme: {UPDATED}</p>

      <p>
        Markas&apos;ı kullanarak aşağıdaki koşulları kabul etmiş olursun. Kabul
        etmiyorsan hizmeti kullanmamalısın.
      </p>

      <h2>1. Hizmetin kapsamı</h2>
      <p>
        Markas, yüklediğin bir görseldeki giyim, aksesuar ve kozmetik parçalarını
        tespit eden ve bunlara benzer ürünleri e-ticaret sitelerinde arayan bir görsel
        arama aracıdır. Sonuçlar bir <strong>öneri</strong>dir, kesin bir ürün
        teşhisi değildir.
      </p>
      <ul>
        <li>
          Markas <strong>satıcı değildir.</strong> Ürün satmaz, ödeme almaz, sipariş
          oluşturmaz, kargo veya iade süreçlerine karışmaz.
        </li>
        <li>
          Satın alma işlemi tamamen ilgili mağazayla arandadır; o mağazanın kendi
          koşulları ve iade politikası geçerlidir.
        </li>
        <li>
          Markas listelenen hiçbir markanın veya mağazanın yetkili temsilcisi,
          bayisi ya da iş ortağı olduğunu iddia etmez. Marka adları yalnızca tanımlama
          amacıyla kullanılır ve sahiplerine aittir.
        </li>
      </ul>

      <h2>2. Eşleşme doğruluğu</h2>
      <p>
        Görsel arama olasılıksal çalışır. Tespit edilen parça yanlış olabilir,
        önerilen ürün görseldeki parçanın aynısı olmayabilir. Kartlarda gösterilen
        &laquo;görsel benzerlik&raquo; yüzdesi bir tahmindir; bir garanti veya
        özdeşlik beyanı değildir.
      </p>
      <p>
        Satın almadan önce ürünü mağaza sayfasında kendin doğrulamalısın.
      </p>

      <h2 id="fiyat">3. Fiyat doğruluğu</h2>
      <p>
        Fiyatlar iki kaynaktan gelir ve <strong>her ikisi de bağlayıcı değildir</strong>:
      </p>
      <ul>
        <li>
          <strong>Canlı mod:</strong> Fiyat, üçüncü taraf bir API (Context.dev)
          aracılığıyla mağaza sayfasından okunur. Mağazalar fiyatlarını, kampanyalarını
          ve stok durumlarını her an değiştirebilir; okuma anıyla senin bakma anın
          arasındaki farkta fiyat değişebilir.
        </li>
        <li>
          <strong>Demo modu:</strong> Canlı motorlar yapılandırılmadığında gösterilen
          rakamlar <strong>örnek veridir</strong> ve gerçek mağaza fiyatlarını temsil
          etmez. Bu durum arayüzdeki &laquo;Demo Modu&raquo; rozetiyle belirtilir.
        </li>
      </ul>
      <p>
        Her koşulda bağlayıcı olan, yönlendirildiğin mağaza sayfasındaki fiyat ve
        stok bilgisidir. Markas fiyat farklılıklarından, tükenen stoktan veya
        kampanya değişikliklerinden sorumlu tutulamaz.
      </p>
      <p>
        Ürün düğmeleri (&laquo;Ürüne git&raquo; / &laquo;İncele&raquo;) yalnızca
        doğrulanmış <strong>ürün detay sayfalarına</strong> (PDP) yönlendirir.
        Mağaza içi arama sonuç sayfalarına bağlantı verilmez.
      </p>

      <h2 id="affiliate">4. Affiliate (iş ortaklığı) bildirimi</h2>
      <p>
        Markas, e-ticaret sitelerindeki bağımsız ürün muadillerini listeler.{" "}
        <strong>
          Yönlendirilen bağlantılar üzerinden yapılan satın alımlardan komisyon
          kazanabiliriz.
        </strong>
      </p>
      <ul>
        <li>
          Dış bağlantılara iş ortaklığı takip parametreleri eklenebilir (örneğin
          Trendyol, Amazon, Zara, Sephora, Mango, H&amp;M, ASOS programları).
        </li>
        <li>
          Bu komisyon <strong>senin ödediğin fiyatı değiştirmez</strong>; mağazanın
          pazarlama bütçesinden karşılanır.
        </li>
        <li>
          Komisyon, hangi ürünlerin gösterildiğini veya sıralamasını belirlemez.
          Sıralama görsel benzerliğe ve fiyata göre yapılır; ücretli yerleştirme
          satmıyoruz.
        </li>
        <li>
          Bağlantılar <code>rel=&quot;sponsored nofollow&quot;</code> ile
          işaretlenir.
        </li>
      </ul>

      <h2>5. Kullanım kuralları</h2>
      <p>Markas&apos;ı kullanırken:</p>
      <ul>
        <li>
          Yüklediğin görseli yükleme hakkına sahip olduğunu beyan edersin. Başkasının
          telif hakkına tabi görselini veya rızası olmayan kişilerin fotoğraflarını
          yüklemekten kaçınmalısın.
        </li>
        <li>
          Hizmeti otomatik araçlarla aşırı yükleme, tersine mühendislik veya izinsiz
          veri çekme amacıyla kullanamazsın.
        </li>
        <li>Yasa dışı içerik yüklemek yasaktır.</li>
      </ul>

      <h2>6. Sorumluluğun sınırlandırılması</h2>
      <p>
        Hizmet &laquo;olduğu gibi&raquo; sunulur. Kesintisiz çalışacağı, sonuçların
        hatasız olacağı veya belirli bir amaca uygunluğu konusunda taahhüt verilmez.
        Yürürlükteki mevzuatın izin verdiği ölçüde, hizmetin kullanımından doğan
        dolaylı zararlardan sorumlu değiliz. Bu sınırlama, tüketici mevzuatının
        sağladığı zorunlu haklarını etkilemez.
      </p>

      <h2>7. Değişiklikler ve iletişim</h2>
      <p>
        Bu koşullar güncellendiğinde yukarıdaki tarih değişir. Sorularını{" "}
        <a href="mailto:iletisim@markas.app">iletisim@markas.app</a> adresine
        gönderebilirsin. Gizlilik uygulamalarımız için{" "}
        <a href="/gizlilik-politikasi">Gizlilik ve Çerez Politikası</a>&apos;na
        bakabilirsin.
      </p>

      <div className="mt-10 rounded-2xl border border-outline-variant/70 bg-surface-container-low p-4">
        <p className="!mt-0 !text-[13px]">
          <strong>Yayına almadan önce doldurulmalı:</strong> Bu metin hizmetin fiilî
          işleyişini doğru anlatır ancak hukuki danışmanlık değildir. İşletme
          bilgileri, uygulanacak hukuk ve yetkili mahkeme{" "}
          <a href="/yasal-bildirim">Yasal Bildirim</a> sayfasında tamamlanmalı ve metin
          bir avukata gözden geçirtilmelidir.
        </p>
      </div>
    </>
  );
}
