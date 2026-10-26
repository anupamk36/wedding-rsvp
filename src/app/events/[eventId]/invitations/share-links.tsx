"use client";

import { useTransition } from "react";
import { CopyButton } from "@/components/forms";
import { buttonClass } from "@/components/ui";

/**
 * Manual sharing: copy the personal link or open WhatsApp with a prefilled
 * message. Either marks the invitation as sent. Nothing is sent automatically.
 */
export function ShareLinks({
  url,
  message,
  phone,
  markSent,
}: {
  url: string;
  message: string;
  phone: string | null;
  markSent: () => Promise<void>;
}) {
  const [, start] = useTransition();
  const digits = phone?.replace(/[^\d]/g, "") ?? "";
  const wa = `https://wa.me/${digits.length >= 10 ? digits : ""}?text=${encodeURIComponent(`${message}\n${url}`)}`;
  return (
    <div className="flex flex-wrap gap-1.5" onClickCapture={() => start(() => markSent())}>
      <CopyButton text={url} />
      <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
        WhatsApp
      </a>
    </div>
  );
}
