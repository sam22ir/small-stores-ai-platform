import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LazyMotion, domAnimation, m } from "motion/react";
import { legal } from "../lib/legal";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { useI18n } from "../lib/i18n";

// Public pages (no sign-in): Meta requires a privacy policy, terms and a way to delete data
// before an app can go live. English only; these are reviewed by Meta and by store owners.

function Page({ title, children }: { title: string; children: ReactNode }) {
  const reduced = useMotionSafe();
  const { t } = useI18n();
  return (
    <LazyMotion features={domAnimation}>
    <div className="min-h-screen bg-paper px-4 py-10">
      <m.main
        className="mx-auto max-w-[65ch] text-[15px] leading-relaxed text-ink"
        initial={reduced ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: dur.base, ease: ease.out }}
      >
        <Link to="/inbox" className="rounded-wakil-sm text-sm text-soft no-underline underline-offset-4 hover:underline">← {legal.product}</Link>
        <h1 className="mb-1 mt-4 text-2xl font-extrabold text-ink">{title}</h1>
        <p className="mb-8 mt-0 text-[13px] text-soft">Last updated: {legal.updated}</p>
        <div className="flex flex-col gap-3">{children}</div>
        <nav className="mt-12 flex flex-wrap gap-4 border-t border-ink/10 pt-6 text-sm text-soft" aria-label={t("legal.nav")}>
          <Link to="/privacy">{t("legal.privacyLink")}</Link>
          <Link to="/terms">{t("legal.termsLink")}</Link>
          <Link to="/data-deletion">{t("legal.deletionLink")}</Link>
        </nav>
      </m.main>
    </div>
    </LazyMotion>
  );
}

const H = ({ children }: { children: ReactNode }) => <h2 className="mb-0 mt-6 text-[17px] font-bold text-ink">{children}</h2>;
const Mail = () => <a href={`mailto:${legal.email}`}>{legal.email}</a>;

export function Privacy() {
  return (
    <Page title="Privacy policy">
      <p>
        {legal.product} (“the service”) is operated by {legal.operator}, {legal.location}. It gives small online
        stores an AI assistant that answers customers' direct messages on Instagram. This policy explains what
        information the service handles and why. Contact: <Mail />.
      </p>

      <H>1. Whose data we handle</H>
      <p><strong>Store owners</strong> who sign up, and <strong>customers of those stores</strong> who send a direct
        message to a connected store account. We act for the store: the store decides to use the service, and we process
        customers' messages on its behalf to answer them.</p>

      <H>2. What we collect</H>
      <ul className="list-disc ps-6 flex flex-col gap-1">
        <li><strong>Store owners:</strong> email address, store name and settings, product catalog and stock, answers the
          owner saves, and the connected Instagram professional account (its numeric ID and username). When an owner
          connects Instagram we receive an access token; it is stored encrypted and is used only to receive and send that
          account's messages.</li>
        <li><strong>Customers:</strong> their Instagram-scoped ID, display name or username when Instagram provides it, and
          the content of the messages they send and the replies they receive. Voice notes, photos and videos are not
          processed or stored; the chat only records that one was sent.</li>
        <li><strong>Orders</strong> (only if the store turns on order taking): the name, phone number, wilaya and delivery
          address a customer gives in the chat, and the items ordered.</li>
        <li><strong>Technical records:</strong> which assistant steps ran for a message, token counts, errors and timestamps,
          used to keep the service reliable and to bill usage.</li>
      </ul>

      <H>3. How we use it</H>
      <ul className="list-disc ps-6 flex flex-col gap-1">
        <li>To read a customer's message, produce a reply using the store's own catalog and notes, and send it.</li>
        <li>To show conversations, orders and stock to the store owner, and to hand a chat to the owner when the assistant
          can't help.</li>
        <li>To secure the service, prevent abuse, limit usage and fix problems.</li>
      </ul>
      <p>We do not sell personal data and we do not use it for advertising.</p>

      <H>4. AI processing</H>
      <p>To write replies, the text of the conversation and the relevant parts of the store's catalog and notes are sent
        to third-party AI model providers. We send only what is needed to answer the message. The assistant is instructed
        to answer only from the store's information and to hand over to the owner when unsure.</p>

      <H>5. Who else handles data</H>
      <p>Supabase (database and server functions, hosted in Ireland, EU), Cloudflare (hosting of the dashboard), the AI
        model providers described above, and Meta (Instagram) as the channel the messages travel through. We share data
        with them only to run the service.</p>

      <H>6. How long we keep it</H>
      <p>Conversations, orders and catalog data are kept while the store uses the service. Disconnecting Instagram deletes
        the stored access token immediately and stops all replies. A store owner or a customer can ask us to delete their
        data at any time (see <Link to="/data-deletion">Data deletion</Link>).</p>

      <H>7. Security</H>
      <p>Each store's data is separated from every other store's and protected by access rules in the database. Access
        tokens are encrypted at rest and cannot be read from the dashboard. Traffic is encrypted in transit.</p>

      <H>8. Your rights</H>
      <p>You can ask to see, correct or delete the personal data we hold about you, and to object to its processing, by
        writing to <Mail />. We handle personal data in line with applicable data-protection law, including Algerian Law
        No. 18-07 on the protection of individuals in the processing of personal data.</p>

      <H>9. Changes</H>
      <p>If we change this policy we will update the date above, and tell store owners about material changes.</p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms of service">
      <p>These terms govern your use of {legal.product}, operated by {legal.operator}, {legal.location}. By creating an
        account or connecting an Instagram account you agree to them.</p>

      <H>1. The service</H>
      <p>{legal.product} lets a store connect its Instagram professional account so an AI assistant can answer customers'
        messages about products, stock, prices and store information, and, if the owner turns it on, collect
        cash-on-delivery orders. The owner can read every chat, reply personally, and switch the assistant off at any time.</p>

      <H>2. Who may use it</H>
      <p>You must be authorised to act for the store and to connect the Instagram account. You must follow Meta's and
        Instagram's terms and policies when using the service, and you are responsible for the messages sent from your
        account.</p>

      <H>3. Your responsibilities</H>
      <ul className="list-disc ps-6 flex flex-col gap-1">
        <li>Keep your catalog, prices, stock and store information accurate. The assistant answers from them.</li>
        <li>Review conversations that are handed to you, and fulfil the orders you accept.</li>
        <li>Do not use the service for unlawful, misleading or abusive messages, or to message people who have not written to you.</li>
        <li>Keep your sign-in details safe.</li>
      </ul>

      <H>4. The assistant can make mistakes</H>
      <p>The assistant is automated. We work to keep its answers accurate and to hand over to you when it is unsure, but we
        cannot guarantee that every answer is correct. You remain responsible for your dealings with your customers.</p>

      <H>5. Fees</H>
      <p>The service may be offered free during a trial. Any fees will be shown to you and agreed before they apply. Usage
        limits may apply to protect the service.</p>

      <H>6. Availability and changes</H>
      <p>We aim for a reliable service but do not guarantee uninterrupted operation, which also depends on Meta and other
        providers. We may change or stop features, and we will give notice of significant changes.</p>

      <H>7. Ending the service</H>
      <p>You can disconnect Instagram or stop using the service at any time. We may suspend accounts that break these terms
        or Meta's rules. On request we delete your data as described in the <Link to="/privacy">privacy policy</Link>.</p>

      <H>8. Liability</H>
      <p>To the extent the law allows, the service is provided “as is” and we are not liable for indirect or consequential
        losses, such as lost sales, arising from its use or from interruptions. Nothing here limits liability that cannot
        be limited by law.</p>

      <H>9. Law and contact</H>
      <p>These terms are governed by the laws of Algeria. Questions: <Mail />.</p>
    </Page>
  );
}

export function DataDeletion() {
  return (
    <Page title="Data deletion">
      <p>You can have your data deleted from {legal.product} at any time.</p>

      <H>If you are a store owner</H>
      <ol className="list-decimal ps-6 flex flex-col gap-1">
        <li>Sign in, open <strong>Assistant → Channels</strong> and choose <strong>Disconnect</strong>. This deletes the
          stored Instagram access token right away and the assistant stops replying.</li>
        <li>To delete your account and all your store's data (catalog, chats, orders), email <Mail /> from the address you
          signed up with, with the subject “Delete my data”.</li>
      </ol>

      <H>If you are a customer of a store</H>
      <p>Your messages were sent to a store that uses this service. To have them deleted, email <Mail /> with the subject
        “Delete my data”, your Instagram username and the name of the store you wrote to. You can also remove the
        service's access from your Instagram settings under <em>Apps and websites</em>.</p>

      <H>What happens next</H>
      <p>We confirm by email, verify that the request comes from the right person, and delete the data within 30 days. Some
        records may be kept only where the law requires it.</p>
    </Page>
  );
}
