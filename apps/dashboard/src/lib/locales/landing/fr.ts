// Landing page copy, French (served at /fr).
import type { LandingDict } from "./types";

const landingFr: LandingDict = {
  htmlLang: "fr",
  dir: "ltr",
  title: "Wakil · Répond à vos clients sur Instagram",
  description:
    "Wakil répond aux messages privés de votre boutique sur Instagram en darija, en français et en arabe. Il vérifie votre stock et vos prix, et calcule la livraison pour chaque wilaya.",
  ogLocale: "fr_DZ",
  nav: { logIn: "Se connecter", startFree: "Commencer gratuitement", langLabel: "Choisir la langue", goInbox: "Aller à la boîte de réception", quality: "Test qualité" },
  hero: {
    kicker: "زبونك يسقسي، وكيل يجاوب.",
    h1: "Vos clients posent leurs questions en message privé. Wakil répond et prend la commande.",
    lede:
      "Wakil répond à vos clients sur Instagram en darija, en français et en arabe. Il vérifie votre stock et vos prix, donne le tarif de livraison de leur wilaya, et vous passe la conversation quand il ne peut pas aider.",
    cta: "Commencer gratuitement",
    ctaNote: "1 000 DA par mois et par boutique",
    slipCaption: "Quand la prise de commande est activée",
    chips: ["Répond uniquement d'après votre catalogue", "Vous passe la main", "Alerte sur Telegram"],
    qualityLink: "Voir notre test public de 500 conversations",
  },
  slip: {
    title: "Bon de commande #0142",
    sub: "Rédigé par Wakil depuis un chat Instagram · 14:03",
    client: "Client",
    phone: "Tél.",
    wilaya: "Wilaya",
    wilayaValue: "31 · Oran",
    item: "Hoodie noir · M",
    itemValue: "3 200 DA",
    delivery: "Livraison",
    total: "Total à payer",
    stamp: "PAIEMENT À LA LIVRAISON",
    trail: "\"Salam, kayen l'hoodie noir taille M?\" → stock vérifié → prix donné → client confirmé.",
  },
  demo: {
    heading: "Essayez vous-même",
    intro: "Choisissez une question et regardez Wakil répondre. Choisissez la wilaya pour voir le tarif de livraison.",
    tabs: ["Darija (latin)", "Français", "Arabe", "Transfert"],
    wilaya: "Wilaya",
    note: "Tarifs indicatifs, pas ceux d'une vraie boutique.",
    typing: "Wakil écrit…",
  },
  chats: {
    heading: "De vraies conversations, de vraies réponses",
    intro: "Exemples de conversations. Wakil répond dans la langue du client.",
    items: [
      {
        customer: "Salam, kayen l'hoodie noir taille M? chhal?",
        reply: "Wa alaykum salam! Ih kayen, noir M b 3,200 DA. Livraison l Oran 400 DA. Nsajlek commande?",
      },
      { customer: "Vous livrez à Sétif ?", reply: "Oui, livraison à Sétif : 450 DA. Je vous réserve une taille ?" },
      {
        customer: "عندي مشكل في طلبي، ممكن نهدر مع البائع؟",
        customerLang: "ar",
        reply: "نعم، سأحوّل المحادثة إلى صاحب المتجر الآن.",
        replyLang: "ar",
        tag: "Transmis au propriétaire · vous le verrez en premier",
      },
    ],
  },
  steps: {
    heading: "Comment ça marche",
    items: [
      { k: "5 min", title: "Ajoutez vos produits", text: "Collez votre liste de stock depuis Excel, ou saisissez-la." },
      { k: "1 clic", title: "Connectez Instagram", text: "Messenger de Facebook arrive bientôt." },
      { k: "Ensuite", title: "Wakil répond", text: "Vous recevez une notification quand une conversation a besoin de vous." },
    ],
  },
  trust: {
    eyebrow: "Des preuves, pas des promesses",
    heading: "Nous le testons avant vos clients.",
    text: "Nous rejouons 500 conversations réalistes, en darija, en français et en arabe, dans le vrai assistant, et nous notons chaque réponse. Chaque série est publique, échecs compris.",
    date: "Dernière série, {date}",
    score: "conversations réussies sur {total}",
    critical: "échecs critiques",
    high: "de gravité élevée",
    cta: "Lire les résultats complets",
    note: "Notation par un modèle de langage, dont une partie revérifiée. Un test, pas une garantie.",
  },
  promises: {
    eyebrow: "Pourquoi les vendeurs lui font confiance",
    heading: "Conçu pour en dire moins, et avoir raison.",
    items: [
      { title: "Seulement votre catalogue", text: "Les prix et le stock viennent des produits que vous avez saisis. Ce qui n'est pas dans votre catalogue, Wakil ne l'invente pas." },
      { title: "Passe la main, ne bluffe jamais", text: "Quand une question vous revient (réclamation, remise, cas inhabituel), la conversation vous est transmise, et Wakil le dit au client." },
      { title: "Livraison par wilaya", text: "Il donne le tarif de livraison de la wilaya du client : vous le fixez, ou vous le synchronisez depuis Yalidine." },
      { title: "Commandes bien conclues", text: "Optionnel et désactivé par défaut : il recueille nom, téléphone, wilaya et article, ajoute le bon tarif de livraison et rédige une commande à la livraison." },
      { title: "Alertes Telegram", text: "Vous recevez une alerte Telegram dès qu'une conversation a besoin de vous, pour répondre avant que le client ne se lasse." },
      { title: "Darija, français, arabe", text: "Il répond dans la langue et l'écriture du client : darija en lettres latines ou arabes, français ou arabe." },
    ],
  },
  pricing: {
    heading: "Un seul tarif",
    price: "1 000 DA",
    per: "par boutique et par mois",
    text: "Tout ce qui est sur cette page, pour une boutique. Vos clients paient à la livraison : Wakil ne prend aucun paiement en ligne de leur part.",
    payNote: "Vous payez Wakil chaque mois par carte EDAHABIA ou CIB via Chargily Pay.",
    includes: ["Réponses d'après votre catalogue, en trois langues", "Tarif de livraison pour chaque wilaya", "Alerte Telegram quand une conversation a besoin de vous", "Prise de commande à la livraison, quand vous l'activez"],
    cta: "Commencer gratuitement",
  },
  faq: {
    heading: "Questions fréquentes",
    items: [
      { q: "Invente-t-il des prix ?", a: "Non. Il n'utilise que les prix et le stock de votre catalogue." },
      { q: "Que se passe-t-il s'il ne peut pas répondre ?", a: "Il vous passe la conversation et vous envoie une notification." },
      { q: "Prend-il des paiements ?", a: "Pas auprès de vos clients. Vos clients paient à la livraison, et la prise de commande est optionnelle." },
      { q: "Quelles langues ?", a: "La darija (en lettres arabes et latines), le français et l'arabe." },
      { q: "Uniquement Instagram ?", a: "Oui, pour le moment. Messenger de Facebook arrive bientôt." },
      { q: "Comment payer ?", a: "Chaque mois, par carte EDAHABIA ou CIB via Chargily Pay." },
      { q: "Le test qualité est-il réel ?", a: "Oui. Ce sont 500 conversations scénarisées passées dans le même code d'assistant et notées une par une. Nous publions chaque série, échecs compris. C'est un test, pas une promesse pour votre boutique." },
      { q: "Comment saurai-je qu'une conversation a besoin de moi ?", a: "Wakil vous envoie une alerte Telegram et la conversation apparaît en premier dans votre boîte de réception." },
    ],
  },
  finalCta: { heading: "Laissez Wakil prendre les messages. Gardez les décisions.", text: "Connectez Instagram, ajoutez vos produits, et voyez-le répondre en quelques minutes.", cta: "Commencer gratuitement" },
  footer: {
    quality: "Test qualité",
    privacy: "Confidentialité",
    terms: "Conditions",
    dataDeletion: "Suppression des données",
    copyright: "© Wakil",
    legal: "Mentions légales",
  },
  notFound: {
    title: "Page introuvable",
    text: "La page a peut-être été déplacée, ou l'adresse est incorrecte.",
    home: "Retour à l'accueil",
    login: "Se connecter",
  },
};

export default landingFr;
