export interface LandingChat {
  customer: string;
  customerLang?: string;
  reply: string;
  replyLang?: string;
  tag?: string;
}

export interface LandingDict {
  htmlLang: string;
  dir: "rtl" | "ltr";
  title: string;
  description: string;
  ogLocale: string;
  nav: { logIn: string; startFree: string; langLabel: string; goInbox: string; quality: string };
  hero: { kicker: string; h1: string; lede: string; cta: string; ctaNote: string; slipCaption: string; chips: string[]; qualityLink: string };
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
  demo: { heading: string; intro: string; tabs: string[]; wilaya: string; note: string; typing: string };
  chats: { heading: string; intro: string; items: LandingChat[] };
  steps: { heading: string; items: { k: string; title: string; text: string }[] };
  trust: { eyebrow: string; heading: string; text: string; date: string; score: string; critical: string; high: string; cta: string; note: string };
  promises: { eyebrow: string; heading: string; items: { title: string; text: string }[] };
  pricing: { heading: string; price: string; per: string; text: string; payNote: string; includes: string[]; cta: string };
  faq: { heading: string; items: { q: string; a: string }[] };
  finalCta: { heading: string; text: string; cta: string };
  footer: { quality: string; privacy: string; terms: string; dataDeletion: string; copyright: string; legal: string };
  notFound: { title: string; text: string; home: string; login: string };
  // Labels for the interactive bits in each section (hero trace, stepper, feature tiles, calculator).
  play: {
    replay: string;
    traceHint: string;
    traceShow: string;
    chatsHint: string;
    stepsHint: string;
    paste: string;
    pasted: string;
    inStock: string;
    soldOut: string;
    connect: string;
    connected: string;
    messengerSoon: string;
    answered: string;
    alertTitle: string;
    alertText: string;
    stockToggle: string;
    langsTap: string;
    handoffBtn: string;
    handoffDone: string;
    ordersToggle: string;
    ordersOff: string;
    ordersOn: string;
    calc: { heading: string; perDay: string; perMonth: string; hours: string; note: string };
  };
}
