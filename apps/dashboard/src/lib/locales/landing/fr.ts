// Landing page copy, French (served at /fr).
import type { LandingDict } from "./types";

const landingFr: LandingDict = {
  htmlLang: "fr",
  dir: "ltr",
  title: "Wakil · Répond à vos clients sur Instagram",
  description:
    "Wakil répond aux messages privés de votre boutique sur Instagram en darija, en français et en arabe. Il vérifie votre stock et vos prix, et calcule la livraison pour chaque wilaya.",
  ogLocale: "fr_DZ",
  nav: { logIn: "Se connecter", startFree: "Commencer gratuitement", langLabel: "Choisir la langue", goInbox: "Aller à la boîte de réception" },
  hero: {
    kicker: "زبونك يسقسي، وكيل يجاوب.",
    h1: "Vos clients posent leurs questions en message privé. Wakil répond et prend la commande.",
    lede:
      "Wakil répond à vos clients sur Instagram en darija, en français et en arabe. Il vérifie votre stock et vos prix, donne le tarif de livraison de leur wilaya, et vous passe la conversation quand il ne peut pas aider.",
    cta: "Commencer gratuitement",
    ctaNote: "1 000 DA par mois et par boutique",
    slipCaption: "Quand la prise de commande est activée",
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
  features: {
    heading: "Ce qu'il fait",
    items: [
      "Stock et prix tirés de votre catalogue, à coller depuis Excel ou CSV",
      "Trois langues : darija (en lettres arabes et latines), français, arabe",
      "Frais de livraison par wilaya : vous les fixez, ou vous les synchronisez depuis Yalidine",
      "Vous passe la conversation quand il ne peut pas aider, et vous prévient",
      "Apprend de vos réponses : enregistrez les vôtres pour lui apprendre",
      "Optionnel : prise de commandes à la livraison dans les conversations, désactivée par défaut",
    ],
  },
  pricing: {
    heading: "Un seul tarif",
    price: "1 000 DA",
    per: "par boutique et par mois",
    text: "Tout ce qui est présenté sur cette page, pour une boutique. Vos clients paient à la livraison, sans paiement en ligne.",
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
    ],
  },
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
