import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { HttpError, ok, readJson, route } from "@/lib/http";
import { MailNotConfiguredError } from "@/lib/mailer";
import { sendOtp, type OtpPurpose } from "@/lib/otp";

const PURPOSES: OtpPurpose[] = ["view_audit", "change_bank_account"];

/** Gửi mã OTP về email owner. */
export const POST = route(async (request) => {
    const actor = await requireActor("admin");
    const body = await readJson(request);
    const purpose = body.purpose as OtpPurpose;
    if (!PURPOSES.includes(purpose)) throw new HttpError(400, "Mục đích OTP không hợp lệ.");
    try {
        const result = await sendOtp(actor, purpose);
        await audit(actor.db, auditActor(actor, "admin"), { action: "otp.sent", entityType: "otp_challenge", entityId: result.otpId, after: { purpose } });
        return ok(result);
    } catch (error) {
        if (error instanceof MailNotConfiguredError) throw new HttpError(503, "Máy chủ chưa cấu hình gửi email.");
        if (error instanceof HttpError) throw error;
        console.error("OTP email failed:", error);
        throw new HttpError(502, "Không gửi được email OTP. Vui lòng thử lại.");
    }
});
