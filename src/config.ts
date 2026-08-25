function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function opt(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  env: opt("NODE_ENV", "development"),

  jwtSecret: () => req("JWT_SECRET"),
  sessionTtlDays: parseInt(opt("SESSION_TTL_DAYS", "365"), 10),

  firebaseAdmin: {
    projectId: () => req("FIREBASE_PROJECT_ID"),
    clientEmail: () => req("FIREBASE_CLIENT_EMAIL"),
    privateKey: () => req("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  },

  firebaseWeb: {
    apiKey: opt("FIREBASE_WEB_API_KEY"),
    authDomain: opt("FIREBASE_AUTH_DOMAIN"),
    projectId: opt("FIREBASE_PROJECT_ID_PUBLIC") || opt("FIREBASE_PROJECT_ID"),
    storageBucket: opt("FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: opt("FIREBASE_MESSAGING_SENDER_ID"),
    appId: opt("FIREBASE_APP_ID"),
    measurementId: opt("FIREBASE_MEASUREMENT_ID"),
    vapidKey: opt("VAPID_PUBLIC_KEY"),
  },

  sms: {
    url: opt("SMS_API_URL"),
    apiKey: opt("SMS_API_KEY"),
    senderId: opt("SMS_SENDER_ID"),
  },

  telegram: {
    botUrl: opt("TELEGRAM_BOT_URL"),
    botSecret: opt("TELEGRAM_BOT_SECRET"),
    botUsername: opt("TELEGRAM_BOT_USERNAME"),
  },

  reportsEmailTo: opt("REPORT_EMAIL_TO"),

  autoDeleteDays: Math.max(1, parseInt(opt("AUTO_DELETE_DAYS", "3"), 10)),

  siteUrl: opt("SITE_URL", ""),

  colors: {
    bgMain: opt("COLOR_BG_MAIN", "#f5f6fa"),
    primary: opt("COLOR_PRIMARY", "#c0392b"),
    primaryHover: opt("COLOR_PRIMARY_HOVER", "#a93226"),
  },

  // Business rules ported from PHP (must match existing behavior exactly)
  rules: {
    availabilityDays: 120,
    requestExpiryHours: 72,
    phoneRegex: /^\+8801\d{9}$/,
    bloodGroups: ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"],
    urgencies: ["Critical", "High", "Medium"],
    maxBags: 10,
    perPageAllowed: [20, 50, 100],
    nearbyMaxRadiusKm: 50,
    nearbyDefaultRadiusKm: 5,
    nearbyResultCap: 30,
    mapDataCap: 200,
  },
} as const;
