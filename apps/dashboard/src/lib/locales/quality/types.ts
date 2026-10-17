// Copy for the public "Wakil 500" quality page. Numbers are not here: they come from qualityData.generated.ts.
export interface QualityDict {
  htmlLang: string;
  dir: "rtl" | "ltr";
  title: string;
  description: string;
  ogLocale: string;
  nav: { logIn: string; startFree: string; langLabel: string };
  hero: { kicker: string; h1: string; lede: string; latest: string; passedOf: string };
  stats: { passed: string; notPassed: string; repeatable: string; repeatableNote: string; oneOff: string };
  rounds: { heading: string; intro: string; round: string; date: string; passed: string; critical: string; high: string; judging: string; partialNote: string; tableLabel: string; severityNote: string };
  roundNames: Record<string, string>;
  judge: Record<string, string>;
  trust: { heading: string; reruns: string; recheck: string; caution: string };
  categories: { heading: string; intro: string; first: string; latest: string; names: Record<string, string> };
  changes: { heading: string; intro: string; none: string; items: Record<string, string> };
  open: { heading: string; intro: string; items: Record<string, string> };
  how: { heading: string; steps: { title: string; text: string }[] };
  limits: { heading: string; items: string[]; model: string };
  cta: { text: string; button: string };
  footer: { home: string; privacy: string; terms: string };
}
