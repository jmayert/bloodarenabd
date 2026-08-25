import { Response } from "express";
import { initializeApp, cert, App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { db } from "../db";
import { config } from "../config";
import { json } from "./requests";

let adminApp: App | null = null;

function getAdminApp(): App {
  if (!adminApp) {
    adminApp = initializeApp(
      {
        credential: cert({
          projectId: config.firebaseAdmin.projectId(),
          clientEmail: config.firebaseAdmin.clientEmail(),
          privateKey: config.firebaseAdmin.privateKey(),
        }),
      },
      "blood-arena"
    );
  }
  return adminApp;
}

/** Best-effort Firebase Auth user deletion (used by account deletion flow). */
export async function deleteFirebaseUser(uid: string): Promise<void> {
  try {
    await getAuth(getAdminApp()).deleteUser(uid);
  } catch (err: unknown) {
    const code = (err as { code?: string }).code;
    if (code !== "auth/user-not-found") throw err;
  }
}

/**
 * POST firebase_auth=1 - exchange a Firebase ID token for a session.
 * Port of the PHP handler: verify token server-side via firebase-admin
 * (replacing Identity Toolkit REST), upsert auth_users, enforce BD phone
 * format for phone-provider accounts.
 */
export async function firebaseAuth(req: any, res: Response) {
  const idToken = String(req.body.id_token ?? "");
  if (!idToken || idToken.length > 4000)
    return json(res, { status: "error", msg: "অবৈধ টোকেন।" });

  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken, true);
    const uid = decoded.uid;
    const phone = (decoded.phone_number as string | undefined) ?? null;
    const email = (decoded.email as string | undefined) ?? null;
    const name =
      (decoded.name as string | undefined) ?? req.body.auth_name?.slice(0, 120) ?? null;
    const picture = (decoded.picture as string | undefined) ?? null;

    if (phone && !/^\+8801\d{9}$/.test(phone))
      return json(res, {
        status: "error",
        msg: "শুধুমাত্র বাংলাদেশী নম্বর (+8801XXXXXXXXX) সাপোর্টেড।",
      });

    const provider: "google" | "phone" =
      decoded.firebase?.sign_in_provider === "phone" ? "phone" : "google";
    const deviceId = String(req.body.device_id ?? "").slice(0, 100) || null;

    await db.authUser.upsert({
      where: { firebaseUid: uid },
      create: {
        firebaseUid: uid,
        provider,
        email: email?.slice(0, 190),
        phone,
        name: name?.slice(0, 120),
        deviceId,
        lastLogin: new Date(),
      },
      update: {
        provider,
        email: email?.slice(0, 190),
        phone,
        name: name?.slice(0, 120),
        lastLogin: new Date(),
        ...(deviceId ? { deviceId } : {}),
      },
    });

    // Phone-provider sign-ins count as verified (PHONE_OTP_COUNTS_VERIFIED)
    const verified = provider === "phone";

    // Session is created by the compat dispatcher (needs JWT secret + CSRF)
    res.locals.authResult = {
      uid,
      provider,
      email,
      phone,
      name,
      picture,
      verified,
    };
    return json(res, {
      status: "success",
      provider,
      email,
      phone,
      name,
      photo: picture,
      verified,
    });
  } catch (err) {
    console.error("firebase_auth error", err);
    return json(res, { status: "error", msg: "লগইন ব্যর্থ হয়েছে। আবার চেষ্টা করুন।" });
  }
}
