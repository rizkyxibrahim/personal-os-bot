import type { Context, MiddlewareFn } from "grammy";

export function ownerOnly(ownerId: string): MiddlewareFn<Context> {
  return async (ctx, next) => {
    if (String(ctx.from?.id) !== ownerId) {
      console.warn("Unauthorized access attempt, user id:", ctx.from?.id);
      return;
    }
    await next();
  };
}
