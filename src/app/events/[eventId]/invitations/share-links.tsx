"use client";

import { useTransition } from "react";
import { CopyButton } from "@/components/forms";
import { buttonClass, cx } from "@/components/ui";

/** wa.me link with the message and personal link prefilled; opens a chat picker without a usable number. */
export function whatsAppUrl(url: string, message: string, phone: string | null): string {
  const digits = phone?.replace(/[^\d]/g, "") ?? "";
  return `https://wa.me/${digits.length >= 10 ? digits : ""}?text=${encodeURIComponent(`${message}\n${url}`)}`;
}

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
  const wa = whatsAppUrl(url, message, phone);
  return (
    <div className="flex flex-wrap gap-1.5" onClickCapture={() => start(() => markSent())}>
      <CopyButton text={url} />
      <a href={wa} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
        WhatsApp
      </a>
    </div>
  );
}

/** A single WhatsApp button that marks the invitation as sent when used. */
export function WhatsAppButton({
  url,
  message,
  phone,
  markSent,
  label,
  className,
}: {
  url: string;
  message: string;
  phone: string | null;
  markSent: () => Promise<void>;
  /** Accessible name when several buttons share the page. */
  label?: string;
  className?: string;
}) {
  const [, start] = useTransition();
  return (
    <a
      href={whatsAppUrl(url, message, phone)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      onClick={() => start(() => markSent())}
      className={cx(buttonClass("secondary", "sm"), className)}
    >
      WhatsApp
    </a>
  );
}
