import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "saas_admin_session";
const SESSION_DURATION = 8 * 60 * 60;

function secret() {
    return new TextEncoder().encode(process.env.SESSION_SECRET ?? "development-secret-change-before-production");
}

export function hashPassword(password: string) {
    const salt = "saas-app-salt-v1";
    return scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(password: string, hash: string) {
    const expected = Buffer.from(hash, "hex");
    const actual = scryptSync(password, "saas-app-salt-v1", 64);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function createSession(user: { id: number; email: string; name: string }) {
    const token = await new SignJWT({ email: user.email, name: user.name })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(String(user.id))
        .setIssuedAt()
        .setExpirationTime(`${SESSION_DURATION}s`)
        .sign(secret());

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SESSION_DURATION,
    });
}

export async function getSession() {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (!token) return null;

    try {
        const { payload } = await jwtVerify(token, secret());
        return {
            id: Number(payload.sub),
            email: String(payload.email),
            name: String(payload.name),
        };
    } catch {
        return null;
    }
}

export async function clearSession() {
    const cookieStore = await cookies();
    cookieStore.delete(SESSION_COOKIE);
}

export function csrfFingerprint(value: string) {
    return createHmac("sha256", process.env.SESSION_SECRET ?? "development-secret").update(value).digest("hex");
}
