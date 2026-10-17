// Interactive demo: pick a question, Wakil replies with a scripted answer; pick a wilaya to see the fee.
// Scripted locally, no API calls. Loaded with React.lazy when the block nears the viewport.
import { useEffect, useState } from "react";
import { Card, ListBox, Select, Tabs } from "@heroui/react";
import { motion } from "motion/react";
import { DmBubble } from "../../components/wakil/DmBubble";
import { CountUp } from "../../components/wakil/CountUp";
import { ZelligeBackground } from "../../components/wakil/ZelligeBackground";
import { ease, useMotionSafe } from "../../lib/motion";
import type { LandingDict } from "../../lib/locales/landing/types";
import { WILAYAS } from "./sections/bits";

// {wilaya} and {fee} are filled from the picker. The handoff question has no fee.
const QUESTIONS: {
  customer: string;
  customerLang?: string;
  reply: string;
  replyLang?: string;
  handoff?: boolean;
}[] = [
  {
    customer: "Salam, kayen l'hoodie noir taille M? chhal?",
    reply: "Wa alaykum salam! Ih kayen, noir M b 3,200 DA. Livraison l {wilaya} {fee} DA. Nsajlek commande?",
  },
  {
    customer: "Vous livrez à {wilaya} ?",
    reply: "Oui, livraison à {wilaya} : {fee} DA. Je vous réserve une taille ?",
  },
  {
    customer: "شحال التوصيل لـ{wilaya}؟",
    customerLang: "ar",
    reply: "التوصيل إلى {wilaya}: {fee} دج.",
    replyLang: "ar",
  },
  {
    customer: "عندي مشكل في طلبي، ممكن نهدر مع البائع؟",
    customerLang: "ar",
    reply: "نعم، سأحوّل المحادثة إلى صاحب المتجر الآن.",
    replyLang: "ar",
    handoff: true,
  },
];

// Renders a template, swapping {fee} for a count-up number and {wilaya} for the name.
function fill(template: string, wilaya: string, fee: number) {
  return template.split(/(\{fee\})/).map((part, i) => {
    if (part === "{fee}") return <CountUp key={i} to={fee} format={(n) => `${Math.round(n)}`} />;
    return <span key={i}>{part.replaceAll("{wilaya}", wilaya)}</span>;
  });
}

function Typing({ label }: { label: string }) {
  const reduced = useMotionSafe();
  return (
    <div role="status" aria-label={label} className="flex w-fit items-center gap-1.5 rounded-2xl rounded-ee-sm bg-blue/10 px-3.5 py-3">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-blue"
          animate={reduced ? undefined : { y: [0, -4, 0] }}
          transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.15, ease: ease.inOut }}
        />
      ))}
    </div>
  );
}

export default function LiveDemo({ copy }: { copy: LandingDict }) {
  const reduced = useMotionSafe();
  const [q, setQ] = useState(0);
  const [w, setW] = useState(1);
  const [replied, setReplied] = useState(reduced);

  const question = QUESTIONS[q];
  const wilaya = WILAYAS[w];
  const handoffTag = copy.chats.items[2].tag;

  // Each new question replays the exchange: customer message, typing, then Wakil's reply.
  useEffect(() => {
    setReplied(reduced);
    if (reduced) return;
    const id = window.setTimeout(() => setReplied(true), 1100);
    return () => window.clearTimeout(id);
  }, [q, reduced]);

  const sub = (text: string) => text.replaceAll("{wilaya}", wilaya.name);

  return (
    <Card className="relative overflow-hidden bg-slip p-0 shadow-paper">
      <ZelligeBackground className="rounded-[inherit]" />
      <div className="relative p-5 sm:p-7">
        <h3 className="text-xl font-extrabold">{copy.demo.heading}</h3>
        <p className="mt-1 text-sm text-soft">{copy.demo.intro}</p>

        <Tabs
          className="mt-5"
          selectedKey={String(q)}
          onSelectionChange={(k) => setQ(Number(k))}
        >
          <Tabs.ListContainer>
            <Tabs.List aria-label={copy.demo.heading}>
              {copy.demo.tabs.map((label, i) => (
                <Tabs.Tab key={i} id={String(i)}>
                  {label}
                  <Tabs.Indicator />
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>

        <div key={q} className="mt-5 min-h-[9.5rem] space-y-3" aria-live="polite">
          <DmBubble variant="in" lang={question.customerLang} animate>
            {sub(question.customer)}
          </DmBubble>
          {!replied && <Typing label={copy.demo.typing} />}
          {replied && question.handoff && (
            <>
              <DmBubble variant="out" lang="ar" animate>{question.reply}</DmBubble>
              <DmBubble variant="note" animate delay={0.2}>{handoffTag}</DmBubble>
            </>
          )}
          {replied && !question.handoff && (
            <DmBubble variant="out" animate>{fill(question.reply, wilaya.name, wilaya.fee)}</DmBubble>
          )}
        </div>

        {!question.handoff && (
          <div className="mt-6 grid gap-2 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-center">
            <Select
              aria-label={copy.demo.wilaya}
              selectedKey={String(w)}
              onSelectionChange={(k) => setW(Number(k))}
              className="w-full"
            >
              <Select.Trigger>
                <Select.Value />
                <Select.Indicator />
              </Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {WILAYAS.map((x, i) => (
                    <ListBox.Item key={x.name} id={String(i)} textValue={x.name}>
                      {x.name}
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                  ))}
                </ListBox>
              </Select.Popover>
            </Select>
            <p className="text-xs text-soft">{copy.demo.note}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
