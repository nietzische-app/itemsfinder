import type { Metadata } from "next";

import { LegalTable } from "@/components/LegalTable";

export const metadata: Metadata = {
  title: "Gizlilik ve Çerez Politikası — Markas",
  description:
    "Markas'a yüklediğin görsellerin nasıl işlendiği, tarayıcı depolaması ve KVKK/GDPR kapsamındaki haklarına dair açıklamalar.",
};

/** Last substantive revision of this document. */
const UPDATED = "29 Temmuz 2026";

export default function PrivacyPage() {
  return (
    <>
      <h1>Gizlilik ve Çerez Politikası</h1>
      <p className="!text-outline">Son güncelleme: {UPDATED}</p>

      <p>
        Markas, bir kombin veya makyaj görselindeki parçaları tespit edip mağazalarda
        muadillerini bulan bir görsel arama aracıdır. Bu metin, bu işlem sırasında
        hangi verilerin işlendiğini ve hangilerinin işlenmediğini açıklar.
      </p>

      <h2>1. Yüklediğin görseller</h2>
      <p>
        Bir görsel seçtiğinde dosya <strong>tarayıcından çıkmaz</strong>; tarayıcının
        oturum depolamasında (<code>sessionStorage</code>) tutulur. Analizi
        başlattığında görsel, tespit isteğiyle birlikte sunucumuza gönderilir, işlenir
        ve yanıt döndükten sonra bırakılır.
      </p>
      <p>Somut olarak:</p>
      <ul>
        <li>
          Görseller <strong>hiçbir veritabanına veya diske yazılmaz.</strong> Markas
          sunucu tarafında kalıcı depolama kullanmaz.
        </li>
        <li>
          Görseller <strong>satılmaz, kiralanmaz veya reklam amacıyla paylaşılmaz.</strong>
        </li>
        <li>
          Sekmeyi kapattığında oturum depolaması tarayıcı tarafından silinir ve görsel
          cihazından da kalkar.
        </li>
        <li>
          Model eğitimi yapmıyoruz; görselin bir yapay zeka modelini eğitmek için
          kullanılmaz.
        </li>
      </ul>
      <p>
        Analizden önce görsel tarayıcında küçültülür (en uzun kenar 1600 piksele
        indirilir ve JPEG olarak yeniden kodlanır). Bu, sunucuya gönderilen veri
        miktarını da azaltır.
      </p>

      <h2>2. Görsel işlemede kullandığımız hizmet sağlayıcılar</h2>
      <p>
        Tespit için <strong>Google Cloud Vision</strong> kullanılır. Bu yapılandırma
        etkinken görsel, analiz edilmek üzere Google&apos;a iletilir ve Google&apos;ın
        kendi koşullarına tabi olur. Google Cloud Vision, isteğe bağlı olarak
        gönderilen görselleri hizmeti sunmak dışında saklamama taahhüdü verir; güncel
        koşullar için Google Cloud belgelerine bakabilirsin.
      </p>
      <p>
        Ürün fiyatı ve stok bilgisi için <strong>Context.dev</strong> kullanılır. Bu
        servise <strong>görselin kendisi gönderilmez</strong>; yalnızca tespit sonucu
        oluşan metin arama sorgusu iletilir (örneğin
        &laquo;Kırmızı Mat Ruj&raquo;).
      </p>
      <p>
        Canlı motorlar yapılandırılmamışsa hiçbir görsel veya sorgu üçüncü tarafa
        gitmez; uygulama tamamen yerel örnek veriyle çalışır. Hangi motorun çalıştığı
        analiz ekranındaki rozette her zaman görünür.
      </p>

      <h2>3. Çerezler ve tarayıcı depolaması</h2>
      <p>
        <strong>Markas çerez kullanmaz.</strong> Reklam, izleme veya analitik çerezi
        yerleştirmiyoruz; üçüncü taraf analiz veya reklam betiği çalıştırmıyoruz.
        Kullandığımız tek şey, aşağıdaki üç kalemle sınırlı tarayıcı depolamasıdır:
      </p>
      <LegalTable>
        <table>
        <thead>
          <tr>
            <th>Anahtar</th>
            <th>Tür</th>
            <th>Amaç</th>
            <th>Süre</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>markas:pending-image</code>
            </td>
            <td>sessionStorage</td>
            <td>Analiz edilecek görseli sayfalar arasında taşımak</td>
            <td>Sekme kapanınca silinir</td>
          </tr>
          <tr>
            <td>
              <code>markas:saved-products</code>
            </td>
            <td>localStorage</td>
            <td>&laquo;Kaydet&raquo; listen</td>
            <td>Sen silene kadar</td>
          </tr>
          <tr>
            <td>
              <code>markas:consent</code>
            </td>
            <td>localStorage</td>
            <td>Bu bildirime verdiğin yanıt</td>
            <td>Sen silene kadar</td>
          </tr>
        </tbody>
      </table>
      </LegalTable>
      <p>
        Üçü de talep ettiğin işlevin çalışması için zorunludur; bu nedenle
        &laquo;Reddet&raquo; seçeneği bugün hiçbir işlevi kapatmaz — kaydedilecek
        isteğe bağlı bir veri yoktur. Onay kaydını yine de tutuyoruz ki ileride
        isteğe bağlı bir ölçüm eklenirse ilk günden bu tercihin arkasında kalsın.
      </p>
      <p>
        Tarayıcı ayarlarından site verilerini temizleyerek bu kayıtların tümünü her an
        silebilirsin.
      </p>

      <h2>4. KVKK ve GDPR kapsamında işleme</h2>
      <p>
        Bir görselde kişi yüzü bulunabileceği için yüklediğin görsel, 6698 sayılı
        Kişisel Verilerin Korunması Kanunu (KVKK) ve GDPR anlamında kişisel veri
        içerebilir. İşleme ilkelerimiz:
      </p>
      <ul>
        <li>
          <strong>Hukuki sebep:</strong> İşleme, senin açık talebin üzerine ve talep
          ettiğin hizmeti sunmak için yapılır (KVKK m.5/2-c; GDPR m.6/1-b).
        </li>
        <li>
          <strong>Amaçla sınırlılık:</strong> Görsel yalnızca görsel arama için
          işlenir; başka bir amaçla kullanılmaz.
        </li>
        <li>
          <strong>Veri minimizasyonu:</strong> Görsel gönderilmeden önce küçültülür ve
          hesap oluşturman istenmez. İsim, e-posta, telefon veya konum toplamıyoruz.
        </li>
        <li>
          <strong>Saklama süresi:</strong> Sunucu tarafında saklama yoktur; işleme
          istek süresiyle sınırlıdır.
        </li>
        <li>
          <strong>Yurt dışına aktarım:</strong> Canlı motorlar etkinse görsel ve/veya
          arama sorgusu, sunucuları Türkiye dışında bulunabilen hizmet sağlayıcılara
          (Google, Context.dev) aktarılır. Bu aktarım, hizmetin sunulabilmesi için
          gereklidir.
        </li>
      </ul>

      <h3>Haklarınız</h3>
      <p>
        KVKK m.11 ve GDPR m.15–22 kapsamında; işlenip işlenmediğini öğrenme, bilgi
        talep etme, düzeltme, silme ve işlemeye itiraz etme haklarına sahipsin.
      </p>
      <p>
        Uygulamanın yapısı gereği <strong>hesap tutmuyoruz</strong>: sana ait bir
        sunucu kaydı olmadığı için silinecek bir profil de yoktur. Tarayıcında
        tutulan verileri site verilerini temizleyerek kendin silebilirsin. Yine de
        bir talebin olursa aşağıdaki adresten ulaşabilirsin.
      </p>

      <h2>5. Güvenlik</h2>
      <p>
        Görsel aktarımı HTTPS üzerinden yapılır. Dış mağaza bağlantıları yeni sekmede
        ve <code>rel=&quot;noopener noreferrer&quot;</code> ile açılır; böylece
        gittiğin site Markas sekmesine erişemez.
      </p>

      <h2>6. Çocuklar</h2>
      <p>
        Markas 13 yaşın altındaki çocuklara yönelik değildir ve bilerek bu yaş
        grubundan veri işlemez.
      </p>

      <h2>7. Değişiklikler ve iletişim</h2>
      <p>
        Bu metin güncellendiğinde yukarıdaki tarih değişir. Sorularını{" "}
        <a href="mailto:iletisim@markas.app">iletisim@markas.app</a> adresine
        gönderebilirsin.
      </p>

      <div className="mt-10 rounded-2xl border border-outline-variant/70 bg-surface-container-low p-4">
        <p className="!mt-0 !text-[13px]">
          <strong>Yayına almadan önce doldurulmalı:</strong> KVKK, aydınlatma
          yükümlülüğü kapsamında veri sorumlusunun kimliğinin açıkça belirtilmesini
          gerektirir. Ticaret unvanı, adres, vergi/MERSİS numarası ve varsa VERBİS
          kaydı{" "}
          <a href="/yasal-bildirim">Yasal Bildirim</a> sayfasındaki alanlara
          girilmelidir. Bu metin, hizmetin fiilî işleyişini doğru biçimde anlatır ancak
          hukuki danışmanlık yerine geçmez.
        </p>
      </div>
    </>
  );
}
