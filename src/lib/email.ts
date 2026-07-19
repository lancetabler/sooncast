import "server-only";

// Sends transactional email via Resend when configured. If RESEND_API_KEY is
// unset, it no-ops (and logs in dev) so the app runs without an email provider.
export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Radarr <onboarding@resend.dev>";
  if (!key) {
    if (process.env.NODE_ENV !== "production") console.log(`[email:noop] to=${opts.to} subject="${opts.subject}"`);
    return false;
  }
  try {
    const { Resend } = await import("resend");
    const resend = new Resend(key);
    await resend.emails.send({ from, to: opts.to, subject: opts.subject, html: opts.html });
    return true;
  } catch (e) {
    console.error("[email] send failed", e);
    return false;
  }
}

export function resetEmailHtml(link: string): string {
  return `
  <div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
    <h2 style="margin:0 0 8px">Reset your Radarr password</h2>
    <p style="color:#555">Click the button below to choose a new password. This link expires in 1 hour.</p>
    <p style="margin:24px 0">
      <a href="${link}" style="background:#5b8cff;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;display:inline-block">Reset password</a>
    </p>
    <p style="color:#888;font-size:13px">If you didn't request this, you can ignore this email.</p>
  </div>`;
}
