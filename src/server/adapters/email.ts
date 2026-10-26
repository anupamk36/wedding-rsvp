// Email delivery behind a small interface so providers can be swapped
// without touching domain code. Select with EMAIL_PROVIDER.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage, opts: { idempotencyKey: string }): Promise<void>;
}

/** Development provider: logs that a message would be sent, without its body or the full address. */
class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  readonly outbox: EmailMessage[] = [];
  async send(message: EmailMessage) {
    this.outbox.push(message);
    if (process.env.NODE_ENV !== "test") {
      const masked = message.to.replace(/^(.).*(@.*)$/, "$1***$2");
      console.info(`[email:console] to=${masked} subject="${message.subject}"`);
    }
  }
}

class ResendEmailProvider implements EmailProvider {
  readonly name = "resend";
  constructor(
    private apiKey: string,
    private from: string,
  ) {}
  async send(message: EmailMessage, opts: { idempotencyKey: string }) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": opts.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  }
}

let provider: EmailProvider | undefined;

export function getEmailProvider(): EmailProvider {
  if (provider) return provider;
  const choice = process.env.EMAIL_PROVIDER ?? "console";
  if (choice === "resend") {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.EMAIL_FROM;
    if (!key || !from) throw new Error("EMAIL_PROVIDER=resend requires RESEND_API_KEY and EMAIL_FROM.");
    provider = new ResendEmailProvider(key, from);
  } else {
    provider = new ConsoleEmailProvider();
  }
  return provider;
}

/** Test hook. */
export function setEmailProvider(p: EmailProvider | undefined) {
  provider = p;
}
