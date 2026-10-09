// All landing page strings. One dictionary per locale; the page component renders any of them.
// The sample chats (Darija, French, Arabic) are the same in every locale on purpose.

export type Locale = 'ar' | 'fr' | 'en';

export const locales: Locale[] = ['ar', 'fr', 'en'];

export const localePaths: Record<Locale, string> = {
  ar: '/',
  fr: '/fr/',
  en: '/en/',
};

export const APP_URL: string =
  (import.meta.env.PUBLIC_APP_URL as string | undefined) || 'http://localhost:5173';

export interface Chat {
  customer: string;
  customerLang?: string;
  reply: string;
  replyLang?: string;
  tag?: string;
}

export interface Dict {
  htmlLang: string;
  dir: 'rtl' | 'ltr';
  title: string;
  description: string;
  ogLocale: string;
  nav: {
    logoName: string;
    logIn: string;
    startFree: string;
    langLabel: string;
  };
  hero: {
    kicker: string;
    h1: string;
    lede: string;
    cta: string;
    ctaNote: string;
    slipCaption: string;
  };
  slip: {
    title: string;
    sub: string;
    client: string;
    phone: string;
    wilaya: string;
    wilayaValue: string;
    item: string;
    itemValue: string;
    delivery: string;
    total: string;
    stamp: string;
    trail: string;
  };
  chats: {
    heading: string;
    intro: string;
    items: Chat[];
  };
  steps: {
    heading: string;
    items: { k: string; title: string; text: string }[];
  };
  features: {
    heading: string;
    items: string[];
  };
  pricing: {
    heading: string;
    price: string;
    per: string;
    text: string;
    cta: string;
  };
  faq: {
    heading: string;
    items: { q: string; a: string }[];
  };
  footer: {
    privacy: string;
    terms: string;
    dataDeletion: string;
    copyright: string;
  };
}

export const dict: Record<Locale, Dict> = {
  ar: {
    htmlLang: 'ar',
    dir: 'rtl',
    title: 'وكيل Wakil · يجاوب زبائنك على إنستغرام وفيسبوك',
    description:
      'وكيل مساعد ذكي يرد على رسائل زبائن متجرك على إنستغرام وفيسبوك بالدارجة والفرنسية والعربية، ويتحقق من المخزون والأسعار ويحسب التوصيل لكل ولاية.',
    ogLocale: 'ar_DZ',
    nav: {
      logoName: 'Wakil',
      logIn: 'تسجيل الدخول',
      startFree: 'ابدأ مجاناً',
      langLabel: 'اختر اللغة',
    },
    hero: {
      kicker: '',
      h1: 'زبونك يسقسي، وكيل يجاوب.',
      lede:
        'وكيل يرد على زبائنك في إنستغرام وفيسبوك بالدارجة والفرنسية والعربية. يتحقق من مخزونك وأسعارك، ويعطي سعر التوصيل لولاية الزبون، ويحوّل المحادثة إليك حين لا يستطيع المساعدة.',
      cta: 'ابدأ مجاناً',
      ctaNote: '1,000 دج في الشهر لكل متجر',
      slipCaption: 'عند تفعيل تسجيل الطلبات',
    },
    slip: {
      title: 'طلب #0142',
      sub: 'كتبه وكيل من محادثة إنستغرام · 14:03',
      client: 'الزبون',
      phone: 'الهاتف',
      wilaya: 'الولاية',
      wilayaValue: '31 · وهران',
      item: 'هودي أسود · M',
      itemValue: '3,200 دج',
      delivery: 'التوصيل',
      total: 'المجموع',
      stamp: 'الدفع عند الاستلام',
      trail: '"Salam, kayen l\'hoodie noir taille M?" ← المخزون تحقق · السعر ذُكر · الزبون أكد',
    },
    chats: {
      heading: 'محادثات حقيقية، وأجوبة مثلها',
      intro: 'أمثلة على محادثات، وفي كل واحدة يجيب وكيل بلغة الزبون.',
      items: [
        {
          customer: 'Salam, kayen l\'hoodie noir taille M? chhal?',
          reply: 'Wa alaykum salam! Ih kayen, noir M b 3,200 DA. Livraison l Oran 400 DA. Nsajlek commande?',
        },
        {
          customer: 'Vous livrez à Sétif ?',
          reply: 'Oui, livraison à Sétif : 450 DA. Je vous réserve une taille ?',
        },
        {
          customer: 'عندي مشكل في طلبي، ممكن نهدر مع البائع؟',
          customerLang: 'ar',
          reply: 'نعم، سأحوّل المحادثة إلى صاحب المتجر الآن.',
          replyLang: 'ar',
          tag: 'تم التحويل إلى صاحب المتجر · سترى الرسالة أولاً',
        },
      ],
    },
    steps: {
      heading: 'كيف يعمل',
      items: [
        { k: '5 دقائق', title: 'أضف منتجاتك', text: 'الصق قائمة مخزونك من Excel أو اكتبها مباشرة.' },
        { k: 'نقرة واحدة', title: 'اربط إنستغرام', text: 'صفحة فيسبوك الخاصة بك تُربط بالطريقة نفسها.' },
        { k: 'بعد ذلك', title: 'وكيل يرد', text: 'تصلك إشعار حين تحتاج محادثة إليك.' },
      ],
    },
    features: {
      heading: 'ماذا يفعل',
      items: [
        'المخزون والأسعار من كتالوجك، ويمكن لصق القائمة من Excel أو CSV',
        'ثلاث لغات: الدارجة (بالحروف العربية واللاتينية)، الفرنسية، والعربية',
        'سعر التوصيل لكل ولايات الجزائر الـ58',
        'يحوّل المحادثة إليك حين لا يستطيع المساعدة، ويرسل لك إشعاراً',
        'يتعلم من ردودك: احفظ ردودك الخاصة ليتعلّمها',
        'اختياري: تسجيل طلبات الدفع عند الاستلام داخل المحادثات، وهو معطّل افتراضياً',
      ],
    },
    pricing: {
      heading: 'سعر واحد',
      price: '1,000 دج',
      per: 'لكل متجر في الشهر',
      text: 'كل ما في الصفحة، لمتجر واحد. بلا دفعات إلكترونية داخل وكيل.',
      cta: 'ابدأ مجاناً',
    },
    faq: {
      heading: 'أسئلة شائعة',
      items: [
        {
          q: 'هل يخترع الأسعار؟',
          a: 'لا. يستعمل الأسعار والمخزون من كتالوجك فقط.',
        },
        {
          q: 'ماذا لو لم يستطع الإجابة؟',
          a: 'يحوّل المحادثة إليك ويرسل لك إشعاراً.',
        },
        {
          q: 'هل يقبل الدفع الإلكتروني؟',
          a: 'لا. الدفع عند الاستلام فقط، وتسجيل الطلبات اختياري.',
        },
        {
          q: 'ما اللغات المدعومة؟',
          a: 'الدارجة (بالحروف العربية واللاتينية)، الفرنسية، والعربية.',
        },
        {
          q: 'هل يعمل على إنستغرام وفيسبوك فقط؟',
          a: 'نعم، حالياً.',
        },
        {
          q: 'كيف أدفع ثمن الاشتراك؟',
          a: 'تواصل معنا.',
          // TODO: owner to fill in payment method
        },
      ],
    },
    footer: {
      privacy: 'سياسة الخصوصية',
      terms: 'شروط الاستخدام',
      dataDeletion: 'حذف البيانات',
      copyright: '© Wakil',
    },
  },

  fr: {
    htmlLang: 'fr',
    dir: 'ltr',
    title: 'Wakil · Répond à vos clients sur Instagram et Facebook',
    description:
      'Wakil répond aux messages privés de votre boutique sur Instagram et Facebook en darija, en français et en arabe. Il vérifie votre stock et vos prix, et calcule la livraison pour chaque wilaya.',
    ogLocale: 'fr_DZ',
    nav: {
      logoName: 'Wakil',
      logIn: 'Se connecter',
      startFree: 'Commencer gratuitement',
      langLabel: 'Choisir la langue',
    },
    hero: {
      kicker: 'زبونك يسقسي، وكيل يجاوب.',
      h1: 'Vos clients posent leurs questions en message privé. Wakil répond et prend la commande.',
      lede:
        'Wakil répond à vos clients sur Instagram et Facebook en darija, en français et en arabe. Il vérifie votre stock et vos prix, donne le tarif de livraison de leur wilaya, et vous passe la conversation quand il ne peut pas aider.',
      cta: 'Commencer gratuitement',
      ctaNote: '1 000 DA par mois et par boutique',
      slipCaption: 'Quand la prise de commande est activée',
    },
    slip: {
      title: 'Bon de commande #0142',
      sub: 'Rédigé par Wakil depuis un chat Instagram · 14:03',
      client: 'Client',
      phone: 'Tél.',
      wilaya: 'Wilaya',
      wilayaValue: '31 · Oran',
      item: 'Hoodie noir · M',
      itemValue: '3 200 DA',
      delivery: 'Livraison',
      total: 'Total à payer',
      stamp: 'PAIEMENT À LA LIVRAISON',
      trail: '"Salam, kayen l\'hoodie noir taille M?" → stock vérifié → prix donné → client confirmé.',
    },
    chats: {
      heading: 'De vraies conversations, de vraies réponses',
      intro: 'Exemples de conversations. Wakil répond dans la langue du client.',
      items: [
        {
          customer: 'Salam, kayen l\'hoodie noir taille M? chhal?',
          reply: 'Wa alaykum salam! Ih kayen, noir M b 3,200 DA. Livraison l Oran 400 DA. Nsajlek commande?',
        },
        {
          customer: 'Vous livrez à Sétif ?',
          reply: 'Oui, livraison à Sétif : 450 DA. Je vous réserve une taille ?',
        },
        {
          customer: 'عندي مشكل في طلبي، ممكن نهدر مع البائع؟',
          customerLang: 'ar',
          reply: 'نعم، سأحوّل المحادثة إلى صاحب المتجر الآن.',
          replyLang: 'ar',
          tag: 'Transmis au propriétaire · vous le verrez en premier',
        },
      ],
    },
    steps: {
      heading: 'Comment ça marche',
      items: [
        { k: '5 min', title: 'Ajoutez vos produits', text: 'Collez votre liste de stock depuis Excel, ou saisissez-la.' },
        { k: '1 clic', title: 'Connectez Instagram', text: 'Votre page Facebook se connecte de la même façon.' },
        { k: 'Ensuite', title: 'Wakil répond', text: 'Vous recevez une notification quand une conversation a besoin de vous.' },
      ],
    },
    features: {
      heading: 'Ce qu\'il fait',
      items: [
        'Stock et prix tirés de votre catalogue, à coller depuis Excel ou CSV',
        'Trois langues : darija (en lettres arabes et latines), français, arabe',
        'Frais de livraison pour chacune des 58 wilayas',
        'Vous passe la conversation quand il ne peut pas aider, et vous prévient',
        'Apprend de vos réponses : enregistrez les vôtres pour lui apprendre',
        'Optionnel : prise de commandes à la livraison dans les conversations, désactivée par défaut',
      ],
    },
    pricing: {
      heading: 'Un seul tarif',
      price: '1 000 DA',
      per: 'par boutique et par mois',
      text: 'Tout ce qui est présenté sur cette page, pour une boutique. Aucun paiement en ligne dans Wakil.',
      cta: 'Commencer gratuitement',
    },
    faq: {
      heading: 'Questions fréquentes',
      items: [
        {
          q: 'Invente-t-il des prix ?',
          a: 'Non. Il n\'utilise que les prix et le stock de votre catalogue.',
        },
        {
          q: 'Que se passe-t-il s\'il ne peut pas répondre ?',
          a: 'Il vous passe la conversation et vous envoie une notification.',
        },
        {
          q: 'Prend-il des paiements ?',
          a: 'Non. Paiement à la livraison uniquement, et la prise de commande est optionnelle.',
        },
        {
          q: 'Quelles langues ?',
          a: 'La darija (en lettres arabes et latines), le français et l\'arabe.',
        },
        {
          q: 'Uniquement Instagram et Facebook ?',
          a: 'Oui, pour le moment.',
        },
        {
          q: 'Comment payer ?',
          a: 'Contactez-nous.',
          // TODO: owner to fill in payment method
        },
      ],
    },
    footer: {
      privacy: 'Confidentialité',
      terms: 'Conditions',
      dataDeletion: 'Suppression des données',
      copyright: '© Wakil',
    },
  },

  en: {
    htmlLang: 'en',
    dir: 'ltr',
    title: 'Wakil · Answers your customers on Instagram and Facebook',
    description:
      'Wakil answers DMs for your online store on Instagram and Facebook in Darija, French and Arabic. It checks your stock and prices and quotes delivery for every wilaya.',
    ogLocale: 'en_US',
    nav: {
      logoName: 'Wakil',
      logIn: 'Log in',
      startFree: 'Start free',
      langLabel: 'Choose language',
    },
    hero: {
      kicker: 'زبونك يسقسي، وكيل يجاوب.',
      h1: 'Customers ask in the DMs. Wakil answers and writes the order.',
      lede:
        'Wakil replies to your customers on Instagram and Facebook in Darija, French or Arabic. It checks your stock and prices, quotes the delivery fee for their wilaya, and hands the chat to you when it can\'t help.',
      cta: 'Start free',
      ctaNote: '1,000 DA per store per month',
      slipCaption: 'When order-taking is on',
    },
    slip: {
      title: 'Order #0142',
      sub: 'Written by Wakil from an Instagram chat · 14:03',
      client: 'Customer',
      phone: 'Phone',
      wilaya: 'Wilaya',
      wilayaValue: '31 · Oran',
      item: 'Hoodie noir · M',
      itemValue: '3,200 DA',
      delivery: 'Delivery',
      total: 'Total due',
      stamp: 'CASH ON DELIVERY',
      trail: '"Salam, kayen l\'hoodie noir taille M?" → stock checked → price quoted → customer confirmed.',
    },
    chats: {
      heading: 'Real chats, real answers',
      intro: 'Sample chats. Wakil replies in the customer\'s language.',
      items: [
        {
          customer: 'Salam, kayen l\'hoodie noir taille M? chhal?',
          reply: 'Wa alaykum salam! Ih kayen, noir M b 3,200 DA. Livraison l Oran 400 DA. Nsajlek commande?',
        },
        {
          customer: 'Vous livrez à Sétif ?',
          reply: 'Oui, livraison à Sétif : 450 DA. Je vous réserve une taille ?',
        },
        {
          customer: 'عندي مشكل في طلبي، ممكن نهدر مع البائع؟',
          customerLang: 'ar',
          reply: 'نعم، سأحوّل المحادثة إلى صاحب المتجر الآن.',
          replyLang: 'ar',
          tag: 'Handed to the owner · you\'ll see it first',
        },
      ],
    },
    steps: {
      heading: 'How it works',
      items: [
        { k: '5 min', title: 'Add your products', text: 'Paste your stock list from Excel, or type it in.' },
        { k: '1 click', title: 'Connect Instagram', text: 'Your Facebook Page works the same way.' },
        { k: 'From then on', title: 'Wakil replies', text: 'You get a notification when a chat needs you.' },
      ],
    },
    features: {
      heading: 'What it does',
      items: [
        'Stock and prices from your catalog, pasted from Excel or CSV',
        'Three languages: Darija (Arabic and Latin letters), French, Arabic',
        'Delivery fee for each of the 58 wilayas',
        'Hands the chat to you when it can\'t help, and notifies you',
        'Learns your answers: save your own replies to teach it',
        'Optional: take cash-on-delivery orders in chats, off by default',
      ],
    },
    pricing: {
      heading: 'One plan',
      price: '1,000 DA',
      per: 'per store per month',
      text: 'Everything on this page, for one store. No online payments in Wakil.',
      cta: 'Start free',
    },
    faq: {
      heading: 'FAQ',
      items: [
        {
          q: 'Does it invent prices?',
          a: 'No. It only uses the prices and stock in your catalog.',
        },
        {
          q: 'What if it can\'t answer?',
          a: 'It hands the chat to you and notifies you.',
        },
        {
          q: 'Does it take payments?',
          a: 'No. Cash on delivery only, and order-taking is optional.',
        },
        {
          q: 'Which languages?',
          a: 'Darija (Arabic and Latin letters), French, Arabic.',
        },
        {
          q: 'Instagram and Facebook only?',
          a: 'Yes, for now.',
        },
        {
          q: 'How do I pay?',
          a: 'Contact us.',
          // TODO: owner to fill in payment method
        },
      ],
    },
    footer: {
      privacy: 'Privacy',
      terms: 'Terms',
      dataDeletion: 'Data deletion',
      copyright: '© Wakil',
    },
  },
};
