import { createApp } from "../src/app";

// Vercel serverless entry (@vercel/node)
const app = createApp();

export default async function handler(req: any, res: any) {
  return app(req, res);
}
