import type { Metadata } from "next";

import { LegalTable } from "@/components/LegalTable";

export const metadata: Metadata = {
  title: "Yasal Bildirim ve KVKK Aydınlatma Metni — Markas",
  description:
    "Markas platformuna dair yasal bildirimler, veri sorumlusu bilgileri ve iletişim kanalları.",
};

const UPDATED = "29 Temmuz 2026";
const CONTACT_EMAIL = "iletisim@markas.app";

/**
 * Veri sorumlusunun adı.
 *
 * Gerçek kişi olduğu için ticaret unvanı yerine ad-soyad geçiyor. Buradaki değer
 * doldurulmadan yayına çıkılmamalı: KVKK aydınlatma yükümlülüğü kimliğin
 * **açıkça** belirtilmesini istiyor, ve yanlış ya da eksik bir kimlik boş
 * bırakmaktan kötüdür.
 */
const CONTROLLER_NAME = "[Ad Soyad]";

/**
 * Yer tutucuyla **üretime** çıkmayı imkânsız kılar.
 *
 * Buradaki not "yayına almadan önce doldur" diyordu ve bu, birinin hatırlamasına
 * bağlı bir güvence — yani güvence değil. Kaçırıldığında sonucu, ziyaretçiye
 * KVKK aydınlatma metninde köşeli parantez göstermek oluyor: veri sorumlusunun
 * kimliğini belirtmeyen bir bildirim, hiç olmamasından daha kötü, çünkü
 * belirtilmiş gibi duruyor.
 *
 * `verifiedProductUrls.ts` aynı şeyi kırık ürün bağlantısı için yapıyor —
 * import sırasında patlıyor. Aynı desen, aynı gerekçe.
 *
 * Yalnızca `VERCEL_ENV === "production"` iken patlıyor: önizleme dağıtımları ve
 * yerel derlemeler yer tutucuyla çalışmaya devam etsin, çünkü bu metnin
 * doldurulması yayın anına ait bir karar, geliştirme anına değil.
 */
if (process.env.VERCEL_ENV === "production" && /\[.+\]/.test(CONTROLLER_NAME)) {
  throw new Error(
    "yasal-bildirim: CONTROLLER_NAME hâlâ yer tutucu. KVKK aydınlatma " +
      "yükümlülüğü veri sorumlusunun kimliğinin açıkça belirtilmesini istiyor; " +
      "üretime bu hâliyle çıkılamaz. src/app/(legal)/yasal-bildirim/page.tsx " +
      "içinde gerçek ad-soyadı yaz.",
  );
}

export default function LegalNoticePage() {
  return (
    <>
      <h1>Yasal Bildirim ve KVKK Aydınlatma Metni</h1>
      <p className="!text-outline">Son güncelleme: {UPDATED}</p>

      <h2>1. Veri sorumlusunun kimliği</h2>
      <p>
        6698 sayılı Kişisel Verilerin Korunması Kanunu (&laquo;KVKK&raquo;) uyarınca
        veri sorumlusu aşağıda belirtilen taraftır.
      </p>
      {/*
        Veri sorumlusu bir **gerçek kişi** olarak yazıldı.
        KVKK md. 3/1-ı veri sorumlusunu "gerçek veya tüzel kişi" olarak tanımlıyor,
        yani şirket kurmadan da veri sorumlusu olunur — ve bu site şu an bir şirkete
        değil bir kişiye ait. Tablo eskiden ticaret unvanı, vergi numarası ve MERSİS
        istiyordu; üçü de yalnızca tüzel kişide bulunur, yani doldurulması imkânsız
        alanlar yüzünden metin sonsuza kadar yer tutucuyla kalırdı.

        Şirket kurulduğunda: aşağıdaki iki satırın yerine ticaret unvanı, vergi
        dairesi/numarası ve MERSİS numarası gelir.
      */}
      <LegalTable>
        <table>
        <tbody>
          <tr>
            <td>
              <strong>Veri sorumlusu</strong>
            </td>
            <td>{CONTROLLER_NAME}</td>
          </tr>
          <tr>
            <td>
              <strong>Sıfatı</strong>
            </td>
            <td>Gerçek kişi (şirket tüzel kişiliği bulunmamaktadır)</td>
          </tr>
          <tr>
            <td>
              <strong>VERBİS kaydı</strong>
            </td>
            <td>
              Gerekli değil — yıllık çalışan sayısı 50&apos;den az ve yıllık mali
              bilanço toplamı 25 milyon TL&apos;den düşük olan veri sorumluları
              VERBİS&apos;e kayıtla yükümlü tutulmamıştır.
            </td>
          </tr>
          <tr>
            <td>
              <strong>E-posta</strong>
            </td>
            <td>
              {/*
                Alone in a cell, so WCAG 2.5.8's "in a block of text" exception
                does not cover it and 17px was under the 24px minimum. The links
                inside the paragraphs below are exempt and left alone.
              */}
              <a className="inline-flex min-h-[24px] items-center" href={`mailto:${CONTACT_EMAIL}`}>
                {CONTACT_EMAIL}
              </a>
            </td>
          </tr>
        </tbody>
      </table>
      </LegalTable>

      <div className="mt-4 rounded-2xl border border-secondary/30 bg-secondary/[0.04] p-4">
        <p className="!mt-0 !text-[13px]">
          <strong>Yayına almadan önce tek bir alan doldurulmalıdır:</strong> yukarıdaki
          ad-soyad. KVKK, aydınlatma yükümlülüğü kapsamında veri sorumlusunun
          kimliğinin açıkça belirtilmesini zorunlu kılar; köşeli parantez kaldığı sürece
          metin mevzuata uygun sayılmaz. Bu bilgiyi uydurmadık — kimliğin sahibi
          tarafından yazılması gerekir.
        </p>
        {/*
          Adres alanı bilerek yok.

          Sorumlu bir şirket değil, bir gerçek kişi. Gerçek kişinin yayınlayacağı
          "açık adres" kendi ev adresidir, ve bir gizlilik metninin altına bir
          kişinin ev adresini koymak, metnin korumaya çalıştığı şeyin tam tersi.
          Kimlik ad + izlenen bir e-posta kutusuyla belirtiliyor. Şirket
          kurulduğunda ticaret unvanı, vergi dairesi/numarası, MERSİS ve tebligat
          adresi birlikte gelir — o zamana kadar eklenecek doğru bir adres yok.
        */}
        <p className="!mb-0 !text-[13px] !text-outline">
          Açık adres alanı yok: veri sorumlusu bir gerçek kişi ve kimlik, ad ile
          izlenen bir e-posta kutusu üzerinden belirtiliyor. Bir tüzel kişilik
          kurulduğunda ticaret unvanı ve tebligat adresi bu tabloya birlikte eklenir.
        </p>
      </div>

      <h2>2. İşlenen veriler ve amaçları</h2>
      <p>
        Markas, hesap oluşturmayı gerektirmez; isim, e-posta, telefon veya konum
        toplamaz. İşlenen tek veri, görsel arama için gönderdiğin görseldir.
      </p>
      <LegalTable>
        <table>
        <thead>
          <tr>
            <th>Veri</th>
            <th>Amaç</th>
            <th>Hukuki sebep</th>
            <th>Saklama</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Yüklenen görsel (kişi görüntüsü içerebilir)</td>
            <td>Görseldeki ürünleri tespit etmek ve muadillerini bulmak</td>
            <td>Sözleşmenin ifası — KVKK m.5/2-c, GDPR m.6/1-b</td>
            <td>Sunucuda saklanmaz; işleme istek süresiyle sınırlıdır</td>
          </tr>
          <tr>
            <td>Teknik istek kayıtları (IP, tarayıcı bilgisi)</td>
            <td>Hizmetin güvenliği ve hata ayıklama</td>
            <td>Meşru menfaat — KVKK m.5/2-f, GDPR m.6/1-f</td>
            <td>Barındırma sağlayıcısının log süresi kadar</td>
          </tr>
          <tr>
            <td>Tarayıcı depolaması (kaydettiğin ürünler, onay tercihi)</td>
            <td>Talep ettiğin işlevin çalışması</td>
            <td>Zorunlu işlev — açık rıza gerektirmez</td>
            <td>Cihazında, sen silene kadar</td>
          </tr>
        </tbody>
      </table>
      </LegalTable>
      <p>
        Ayrıntılar ve hizmet sağlayıcı listesi için{" "}
        <a href="/gizlilik-politikasi">Gizlilik ve Çerez Politikası</a>&apos;na bakınız.
      </p>

      <h2>3. Aktarım yapılan taraflar</h2>
      <ul>
        <li>
          <strong>Google Cloud Vision</strong> — canlı tespit etkinse görsel, analiz
          için aktarılır.
        </li>
        <li>
          <strong>Context.dev</strong> — canlı ürün verisi etkinse yalnızca metin arama
          sorgusu aktarılır; görsel aktarılmaz.
        </li>
        <li>
          <strong>Barındırma sağlayıcısı</strong> — uygulamanın çalıştırılması için.
        </li>
      </ul>
      <p>
        Bu sağlayıcıların sunucuları Türkiye dışında bulunabilir; aktarım hizmetin
        sunulabilmesi için gereklidir.
      </p>

      <h2>4. İlgili kişinin hakları ve başvuru</h2>
      <p>
        KVKK m.11 kapsamında; kişisel verilerinin işlenip işlenmediğini öğrenme, bilgi
        talep etme, işlenme amacını öğrenme, düzeltilmesini veya silinmesini isteme ve
        işlemeye itiraz etme haklarına sahipsin.
      </p>
      <p>
        Başvurularını <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> adresine
        iletebilirsin; talebin en geç 30 gün içinde yanıtlanır. Yanıttan memnun
        kalmazsan Kişisel Verileri Koruma Kurumu&apos;na şikâyette bulunabilirsin.
      </p>
      <p>
        Hesap sistemi bulunmadığı için sunucuda sana ait bir kayıt tutulmaz; bu nedenle
        silinecek bir profil de yoktur. Cihazındaki verileri tarayıcı ayarlarından site
        verilerini temizleyerek kaldırabilirsin.
      </p>

      <h2>5. Fikri mülkiyet ve marka adları</h2>
      <p>
        Markas adı, logosu ve arayüz tasarımı Markas&apos;a aittir. Sayfalarda geçen
        Trendyol, Zara, Mango, H&amp;M, ASOS, Amazon, Sephora ve diğer mağaza ve marka
        adları ilgili sahiplerinin tescilli markalarıdır ve yalnızca tanımlama amacıyla
        kullanılır. Markas bu markalarla bağlantılı, onlar tarafından desteklenen veya
        yetkilendirilmiş bir hizmet değildir.
      </p>

      <h2>6. Ticari ilişki bildirimi</h2>
      <p>
        Markas, dış mağaza bağlantıları üzerinden komisyon kazanabilir. Ayrıntılar{" "}
        <a href="/kullanim-kosullari#affiliate">
          Kullanım Koşulları — Affiliate Bildirimi
        </a>{" "}
        bölümünde yer alır.
      </p>

      <h2>7. İletişim</h2>
      <p>
        Yasal bildirimler ve KVKK başvuruları:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
        <br />
        Kullanıcı desteği: <a href="mailto:destek@markas.app">destek@markas.app</a>
      </p>
      <p className="!text-[13px] !text-outline">
        Not: Bu adreslerin gerçek ve izlenen kutulara yönlendirildiğinden emin
        olunmalıdır. KVKK başvurularının 30 gün içinde yanıtlanması yasal bir
        yükümlülüktür.
      </p>
    </>
  );
}
