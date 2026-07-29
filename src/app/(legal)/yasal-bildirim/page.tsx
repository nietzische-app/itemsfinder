import type { Metadata } from "next";

import { LegalTable } from "@/components/LegalTable";

export const metadata: Metadata = {
  title: "Yasal Bildirim ve KVKK Aydınlatma Metni — Markas",
  description:
    "Markas platformuna dair yasal bildirimler, veri sorumlusu bilgileri ve iletişim kanalları.",
};

const UPDATED = "29 Temmuz 2026";
const CONTACT_EMAIL = "iletisim@markas.app";

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
      <LegalTable>
        <table>
        <tbody>
          <tr>
            <td>
              <strong>Ticaret unvanı</strong>
            </td>
            <td>[Şirket / işletme unvanı]</td>
          </tr>
          <tr>
            <td>
              <strong>Adres</strong>
            </td>
            <td>[Açık adres]</td>
          </tr>
          <tr>
            <td>
              <strong>Vergi dairesi / no</strong>
            </td>
            <td>[Vergi dairesi ve numarası]</td>
          </tr>
          <tr>
            <td>
              <strong>MERSİS no</strong>
            </td>
            <td>[MERSİS numarası]</td>
          </tr>
          <tr>
            <td>
              <strong>VERBİS kaydı</strong>
            </td>
            <td>[Varsa VERBİS kayıt bilgisi]</td>
          </tr>
          <tr>
            <td>
              <strong>E-posta</strong>
            </td>
            <td>
              <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
            </td>
          </tr>
        </tbody>
      </table>
      </LegalTable>

      <div className="mt-4 rounded-2xl border border-secondary/30 bg-secondary/[0.04] p-4">
        <p className="!mt-0 !text-[13px]">
          <strong>Bu alanlar yayına almadan önce doldurulmalıdır.</strong> KVKK,
          aydınlatma yükümlülüğü kapsamında veri sorumlusunun kimliğinin açıkça
          belirtilmesini zorunlu kılar; köşeli parantezli alanlar boş bırakılırsa metin
          mevzuata uygun sayılmaz. Bu bilgileri uydurmadık — gerçek işletme
          bilgilerinin girilmesi gerekir.
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
