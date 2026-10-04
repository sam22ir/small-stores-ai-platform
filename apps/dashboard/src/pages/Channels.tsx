import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { platformKey } from "./Inbox";

type Channel = { id: string; platform: string; display_name: string | null; status: string };

export function Channels() {
  const { t } = useI18n();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    void supabase.from("channels").select("id,platform,display_name,status").order("created_at").then(({ data, error }) => {
      if (error) setFailed(true); else setChannels(data as Channel[]);
    });
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-extrabold mt-1 mb-2">{t("channels.title")}</h1>
      <p className="muted mt-0 mb-4">{t("channels.intro")}</p>

      <div className="grid gap-3 sm:grid-cols-2 mb-6">
        {(["channels.facebook", "channels.instagram"] as const).map((k) => (
          <div key={k} className="card p-4 flex items-center justify-between gap-3">
            <span className="font-bold">{t(k)}</span>
            <button className="btn btn-small" disabled>{t("channels.soon")}</button>
          </div>
        ))}
      </div>

      {failed && <p className="error">{t("common.error")}</p>}
      {channels && channels.length === 0 && <p className="muted">{t("channels.none")}</p>}
      <ul className="list-none p-0 m-0 flex flex-col gap-2">
        {(channels ?? []).map((c) => (
          <li key={c.id} className="card p-4 flex items-center justify-between gap-3">
            <span className="font-semibold">{t(platformKey(c.platform))}{c.display_name ? ` · ${c.display_name}` : ""}</span>
            <span className={`badge ${c.status === "active" ? "badge-ok" : "badge-muted"}`}>{t("channels.connected")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
