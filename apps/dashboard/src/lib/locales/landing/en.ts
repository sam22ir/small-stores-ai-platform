// Landing page copy, English (served at /en).
import type { LandingDict } from "./types";

const landingEn: LandingDict = {
  htmlLang: "en",
  dir: "ltr",
  title: "Wakil · Answers your customers on Instagram and Facebook",
  description:
    "Wakil answers DMs for your online store on Instagram and Facebook in Darija, French and Arabic. It checks your stock and prices and quotes delivery for every wilaya.",
  ogLocale: "en_US",
  nav: { logIn: "Log in", startFree: "Start free", langLabel: "Choose language", goInbox: "Go to inbox" },
  hero: {
    kicker: "زبونك يسقسي، وكيل يجاوب.",
    h1: "Customers ask in the DMs. Wakil answers and writes the order.",
    lede:
      "Wakil replies to your customers on Instagram and Facebook in Darija, French or Arabic. It checks your stock and prices, quotes the delivery fee for their wilaya, and hands the chat to you when it can't help.",
    cta: "Start free",
    ctaNote: "1,000 DA per store per month",
    slipCaption: "When order-taking is on",
  },
  slip: {
    title: "Order #0142",
    sub: "Written by Wakil from an Instagram chat · 14:03",
    client: "Customer",
    phone: "Phone",
    wilaya: "Wilaya",
    wilayaValue: "31 · Oran",
    item: "Hoodie noir · M",
    itemValue: "3,200 DA",
    delivery: "Delivery",
    total: "Total due",
    stamp: "CASH ON DELIVERY",
    trail: "\"Salam, kayen l'hoodie noir taille M?\" → stock checked → price quoted → customer confirmed.",
  },
  demo: {
    heading: "Try it yourself",
    intro: "Pick a question and watch Wakil reply. Pick a wilaya to see its delivery fee.",
    tabs: ["Darija (Latin)", "French", "Arabic", "Handoff"],
    wilaya: "Wilaya",
    note: "Example fees, not a real store's prices.",
    typing: "Wakil is typing…",
  },
  chats: {
    heading: "Real chats, real answers",
    intro: "Sample chats. Wakil replies in the customer's language.",
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
        tag: "Handed to the owner · you'll see it first",
      },
    ],
  },
  steps: {
    heading: "How it works",
    items: [
      { k: "5 min", title: "Add your products", text: "Paste your stock list from Excel, or type it in." },
      { k: "1 click", title: "Connect Instagram", text: "Your Facebook Page works the same way." },
      { k: "From then on", title: "Wakil replies", text: "You get a notification when a chat needs you." },
    ],
  },
  features: {
    heading: "What it does",
    items: [
      "Stock and prices from your catalog, pasted from Excel or CSV",
      "Three languages: Darija (Arabic and Latin letters), French, Arabic",
      "Delivery fee for each of the 58 wilayas",
      "Hands the chat to you when it can't help, and notifies you",
      "Learns your answers: save your own replies to teach it",
      "Optional: take cash-on-delivery orders in chats, off by default",
    ],
  },
  pricing: {
    heading: "One plan",
    price: "1,000 DA",
    per: "per store per month",
    text: "Everything on this page, for one store. No online payments in Wakil.",
    cta: "Start free",
  },
  faq: {
    heading: "FAQ",
    items: [
      { q: "Does it invent prices?", a: "No. It only uses the prices and stock in your catalog." },
      { q: "What if it can't answer?", a: "It hands the chat to you and notifies you." },
      { q: "Does it take payments?", a: "No. Cash on delivery only, and order-taking is optional." },
      { q: "Which languages?", a: "Darija (Arabic and Latin letters), French, Arabic." },
      { q: "Instagram and Facebook only?", a: "Yes, for now." },
      { q: "How do I pay?", a: "Monthly, in cash. No card or online payment needed." },
    ],
  },
  footer: {
    privacy: "Privacy",
    terms: "Terms",
    dataDeletion: "Data deletion",
    copyright: "© Wakil",
    legal: "Legal",
  },
  notFound: {
    title: "Page not found",
    text: "The page may have moved, or the address is wrong.",
    home: "Back to home",
    login: "Log in",
  },
};

export default landingEn;
