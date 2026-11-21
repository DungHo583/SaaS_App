import nodemailer, { type Transporter } from "nodemailer";

export class MailNotConfiguredError extends Error {
    constructor() {
        super("Chưa cấu hình SMTP_HOST.");
    }
}

let transporter: Transporter | null = null;

/**
 * SMTP transporter. Development mặc định gửi vào Mailpit (localhost:1025, xem docker-compose.yml);
 * production bắt buộc cấu hình SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS.
 */
function getTransporter() {
    if (transporter) return transporter;
    const host = process.env.SMTP_HOST ?? (process.env.NODE_ENV === "production" ? undefined : "localhost");
    if (!host) throw new MailNotConfiguredError();
    const port = Number(process.env.SMTP_PORT ?? (process.env.SMTP_HOST ? 587 : 1025));
    transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
    });
    return transporter;
}

export async function sendMail(message: { to: string; subject: string; html: string; text: string }) {
    return getTransporter().sendMail({
        from: process.env.MAIL_FROM ?? "Bếp Nhà <no-reply@bepnha.local>",
        ...message,
    });
}

export function isValidEmail(value: string) {
    return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
