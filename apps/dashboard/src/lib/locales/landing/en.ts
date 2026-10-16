// Landing page copy, English (served at /en).
import type { LandingDict } from "./types";

const landingEn: LandingDict = {
  htmlLang: "en",
  dir: "ltr",
  title: "Wakil · Answers your customers on Instagram",
  description:
    "Wakil answers DMs for your online store on Instagram in Darija, French and Arabic. It checks your stock and prices and quotes delivery for each wilaya.",
  ogLocale: "en_US",
  nav: { logIn: "Log in", startFree: "Start free", langLabel: "Choose language", goInbox: "Go to inbox", quality: "Quality test" },
  hero: {
    kicker: "زبونك يسقسي، وكيل يجاوب.",
    h1: "Customers ask in the DMs. Wakil answers and writes the order.",
    lede:
      "Wakil replies to your customers on Instagram in Darija, French or Arabic. It checks your stock and prices, quotes the delivery fee for their wilaya, and hands the chat to you when it can't help.",
    cta: "Start free",
    ctaNote: "1,000 DA per store per month",
    slipCaption: "When order-taking is on",
    chips: ["Answers only from your catalog", "Hands over to you", "Alerts you on Telegram"],
    qualityLink: "See our public 500-conversation test",
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
      { k: "1 click", title: "Connect Instagram", text: "Facebook Messenger is coming soon." },
      { k: "From then on", title: "Wakil replies", text: "You get a notification when a chat needs you." },
    ],
  },
  trust: {
    eyebrow: "Proof, not promises",
    heading: "We test it before your customers do.",
    text: "We replay 500 realistic conversations, in Darija, French and Arabic, through the real assistant and grade every reply. Every round is public, the failures included.",
    date: "Latest round, {date}",
    score: "of {total} conversations passed",
    critical: "critical failures",
    high: "high-severity",
    cta: "Read the full test results",
    note: "Graded by a language model, with part of the grades re-checked. A test, not a guarantee.",
  },
  promises: {
    eyebrow: "Why owners trust it",
    heading: "Built to say less, and be right.",
    items: [
      { title: "Only your catalog", text: "Prices and stock come from the products you entered. If it isn't in your catalog, Wakil doesn't make it up." },
      { title: "Hands over, never bluffs", text: "When a question needs you (a complaint, a discount, something odd) the chat goes to you, and Wakil says so to the customer." },
      { title: "Delivery per wilaya", text: "It quotes the delivery fee for the customer's wilaya: you set it, or sync it from Yalidine." },
      { title: "Orders closed correctly", text: "Optional and off by default: it collects name, phone, wilaya and item, adds the right delivery fee and writes a cash-on-delivery order." },
      { title: "Telegram alerts", text: "You get a Telegram alert the moment a chat needs you, so you reply before the customer goes cold." },
      { title: "Darija, French, Arabic", text: "It answers in the customer's language and script: Darija in Latin or Arabic letters, French or Arabic." },
    ],
  },
  pricing: {
    heading: "One plan",
    price: "1,000 DA",
    per: "per store per month",
    text: "Everything on this page, for one store. Customers pay cash on delivery: Wakil takes no online payments from them.",
    payNote: "You pay Wakil monthly by EDAHABIA or CIB card through Chargily Pay.",
    includes: ["Answers from your catalog in three languages", "Delivery fee for every wilaya", "Telegram alert when a chat needs you", "Cash-on-delivery order capture, when you turn it on"],
    cta: "Start free",
  },
  faq: {
    heading: "FAQ",
    items: [
      { q: "Does it invent prices?", a: "No. It only uses the prices and stock in your catalog." },
      { q: "What if it can't answer?", a: "It hands the chat to you and notifies you." },
      { q: "Does it take payments?", a: "Not from customers. Customers pay cash on delivery, and order-taking is optional." },
      { q: "Which languages?", a: "Darija (Arabic and Latin letters), French, Arabic." },
      { q: "Instagram only?", a: "Yes, for now. Facebook Messenger is coming soon." },
      { q: "How do I pay?", a: "Monthly, by EDAHABIA or CIB card through Chargily Pay." },
      { q: "Is the quality test real?", a: "Yes. It is 500 scripted conversations run through the same assistant code and graded one by one. We publish every round, including failures. It is a test, not a promise about your store." },
      { q: "How do I know when a chat needs me?", a: "Wakil sends you a Telegram alert and the chat shows up in your inbox first." },
    ],
  },
  finalCta: { heading: "Let Wakil take the DMs. Keep the decisions.", text: "Connect Instagram, add your products, and see it answer in minutes.", cta: "Start free" },
  footer: {
    quality: "Quality test",
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
