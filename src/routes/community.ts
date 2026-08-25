import crypto from "crypto";
import { Response } from "express";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { json, expireStaleRequests } from "./requests";

/** POST get_community_posts=1 - feed with rating aggregates. */
export async function getCommunityPosts(req: any, res: Response) {
  try {
    const type = req.body.type === "question" ? "question" : "review";
    const offset = Math.max(0, parseInt(String(req.body.offset ?? "0"), 10) || 0);
    const limit = Math.min(50, Math.max(1, parseInt(String(req.body.limit ?? "10"), 10) || 10));

    // Single-post mode with replies
    if (req.body.post_id) {
      const postId = parseInt(String(req.body.post_id), 10);
      const post = await db.communityPost.findUnique({
        where: { id: postId },
        include: {
          replies: { orderBy: { createdAt: "asc" }, take: 100 },
        },
      });
      if (!post) return json(res, { status: "error", msg: "পোস্ট পাওয়া যায়নি।" });
      return json(res, {
        status: "success",
        post: shapePost(post),
        replies: post.replies.map(shapeReply),
      });
    }

    const [rows, total] = await Promise.all([
      db.communityPost.findMany({
        where: { type },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit + 1,
      }),
      db.communityPost.count({ where: { type } }),
    ]);
    const hasMore = rows.length > limit;
    return json(res, {
      status: "success",
      posts: rows.slice(0, limit).map(shapePost),
      has_more: hasMore,
      total,
    });
  } catch (err) {
    console.error("get_community_posts error", err);
    return json(res, { status: "error", posts: [] });
  }
}

function shapePost(p: any) {
  return {
    id: p.id,
    type: p.type,
    display_name: p.displayName,
    content: p.content,
    rating: p.rating,
    created_at: p.createdAt.toISOString(),
  };
}

function shapeReply(r: any) {
  return {
    id: r.id,
    post_id: r.postId,
    display_name: r.displayName,
    content: r.content,
    created_at: r.createdAt.toISOString(),
  };
}

/**
 * POST create_community_post=1 - <=500 chars; reviews require rating 1-5;
 * DB-backed rate limit 5/hr + min 300s between posts.
 */
export async function createCommunityPost(req: any, res: Response) {
  const type = req.body.type === "question" ? "question" : "review";
  let content = String(req.body.content ?? "").trim();
  if (content.length === 0 || content.length > 500)
    return json(res, { status: "error", msg: "লেখা ১ থেকে ৫০০ অক্ষরের মধ্যে হতে হবে।" });

  let rating: number | null = null;
  if (type === "review") {
    rating = parseInt(String(req.body.rating ?? ""), 10);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5)
      return json(res, { status: "error", msg: "রেটিং দিন (১-৫)।" });
  }

  const actorId = (req.session?.auth_uid ?? req.ip ?? "anon").slice(0, 128);
  try {
    // Rate gates: 5/hour via action log, plus 1 per 300s
    const hourAgo = new Date(Date.now() - 3600_000);
    const [perHour, lastAction] = await Promise.all([
      db.communityActionLog.count({ where: { actorId, createdAt: { gte: hourAgo } } }),
      db.communityActionLog.findFirst({
        where: { actorId },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    if (lastAction && Date.now() - lastAction.createdAt.getTime() < 300_000)
      return json(res, { status: "error", msg: "একটু থামুন — কিছুক্ষণ পর আবার লিখুন।" });
    if (perHour >= 5)
      return json(res, { status: "error", msg: "ঘণ্টায় সর্বোচ্চ ৫টি পোস্ট/মন্তব্য করা যায়।" });

    const displayName =
      req.session?.auth_name?.slice(0, 120) ||
      String(req.body.display_name ?? "").trim().slice(0, 120) ||
      "Anonymous";

    const post = await db.$transaction(async (tx) => {
      const p = await tx.communityPost.create({
        data: {
          type,
          authUid: req.session?.auth_uid ?? null,
          displayName,
          content,
          rating,
          ipAddress: req.ip?.slice(0, 45),
        },
      });
      await tx.communityActionLog.create({
        data: { actorId, actionType: "post" },
      });
      return p;
    });

    return json(res, { status: "success", post_id: post.id, msg: "পোস্ট হয়েছে!" });
  } catch (err) {
    console.error("create_community_post error", err);
    return json(res, { status: "error", msg: "সার্ভার সমস্যা।" });
  }
}

/** POST create_community_reply=1 - post must exist; 1/60s + 5/hr. */
export async function createCommunityReply(req: any, res: Response) {
  const postId = parseInt(String(req.body.post_id ?? ""), 10);
  const content = String(req.body.content ?? "").trim();
  if (!Number.isInteger(postId))
    return json(res, { status: "error", msg: "অবৈধ পোস্ট।" });
  if (content.length === 0 || content.length > 500)
    return json(res, { status: "error", msg: "লেখা ১ থেকে ৫০০ অক্ষরের মধ্যে হতে হবে।" });

  const actorId = (req.session?.auth_uid ?? req.ip ?? "anon").slice(0, 128);
  try {
    const exists = await db.communityPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!exists) return json(res, { status: "error", msg: "পোস্ট পাওয়া যায়নি।" });

    const hourAgo = new Date(Date.now() - 3600_000);
    const [perHour, lastAction] = await Promise.all([
      db.communityActionLog.count({ where: { actorId, createdAt: { gte: hourAgo } } }),
      db.communityActionLog.findFirst({ where: { actorId }, orderBy: { createdAt: "desc" } }),
    ]);
    if (lastAction && Date.now() - lastAction.createdAt.getTime() < 60_000)
      return json(res, { status: "error", msg: "একটু থামুন — কিছুক্ষণ পর আবার লিখুন।" });
    if (perHour >= 5)
      return json(res, { status: "error", msg: "ঘণ্টায় সর্বোচ্চ ৫টি পোস্ট/মন্তব্য করা যায়।" });

    const displayName =
      req.session?.auth_name?.slice(0, 120) ||
      String(req.body.display_name ?? "").trim().slice(0, 120) ||
      "Anonymous";

    await db.$transaction(async (tx) => {
      await tx.communityReply.create({
        data: {
          postId,
          authUid: req.session?.auth_uid ?? null,
          displayName,
          content,
          ipAddress: req.ip?.slice(0, 45),
        },
      });
      await tx.communityActionLog.create({
        data: { actorId, actionType: "reply" },
      });
    });
    return json(res, { status: "success", msg: "মন্তব্য যোগ হয়েছে!" });
  } catch (err) {
    console.error("create_community_reply error", err);
    return json(res, { status: "error", msg: "সার্ভার সমস্যা।" });
  }
}

/** POST get_community_unread=1 - count since timestamp, capped at 9. */
export async function getCommunityUnread(req: any, res: Response) {
  try {
    const ts = parseInt(String(req.body.last_seen_ts ?? "0"), 10) || 0;
    if (!ts) return json(res, { unread: 0 });
    const since = new Date(ts * 1000);
    const count = await db.communityPost.count({
      where: { createdAt: { gt: since }, NOT: { authUid: req.session?.auth_uid ?? "" } },
    });
    return json(res, { unread: Math.min(9, count) });
  } catch (err) {
    console.error("get_community_unread error", err);
    return json(res, { unread: 0 });
  }
}
