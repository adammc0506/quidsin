import { useEffect, useState } from "react";
import "./extras.css";

/** A button that reveals a QR code for the link, so people nearby can scan it. */
export function QrToggle({ url, label = "Show QR code" }: { url: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const [svg, setSvg] = useState("");
  useEffect(() => {
    if (!open || svg) return;
    let live = true;
    import("qrcode").then((m) => m.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [open, svg, url]);
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide QR code" : label}
      </button>
      {open && (
        <div className="qr-box" role="img" aria-label="QR code for the link">
          {svg ? <span dangerouslySetInnerHTML={{ __html: svg }} /> : <span className="qr-wait">Making code…</span>}
          <p>Point a phone camera at this.</p>
        </div>
      )}
    </>
  );
}

/** A quiet link to FundTheTeam for people running a club or team. */
export function FundPromo({ line }: { line?: string }) {
  return (
    <aside className="fund-promo">
      <p>
        <strong>{line ?? "Fundraising for a club or team?"}</strong>{" "}
        <a href="https://fundtheteam.net/" target="_blank" rel="noopener">
          Try FundTheTeam
        </a>
        . Tab &amp; Tally tools never handle money.
      </p>
    </aside>
  );
}
