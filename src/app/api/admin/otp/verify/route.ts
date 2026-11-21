import { audit } from "@/lib/audit";
import { auditActor, requireActor } from "@/lib/auth";
import { HttpError, ok, readJson, route, text, uuid } from "@/lib/http";
import { verifyOtp, type OtpPurpose } from "@/lib/otp";

/** Xác thực OTP → cấp quyền 15 phút cho mục đích tương ứng. */
export const POST = route(async (request) => {
    const actor = await requireActor("admin");
    const body = await readJson(request);
    const purpose = body.purpose as OtpPurpose;
    if (!["view_audit", "change_bank_account"].includes(purpose)) throw new HttpError(400, "Mục đích OTP không hợp lệ.");
    const otpId = uuid(body.otpId, "Mã OTP");
    await verifyOtp(actor, purpose, otpId, text(body.code, { max: 6, required: true, label: "Mã OTP" }));
    await audit(actor.db, auditActor(actor, "admin"), { action: "otp.verified", entityType: "otp_challenge", entityId: otpId, after: { purpose } });
    return ok({ ok: true, grantMinutes: 15 });
});
