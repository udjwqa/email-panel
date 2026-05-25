import { FastifyRequest, FastifyReply } from "fastify";

export interface JwtUser {
  id: number;
  role: string;
  isAdmin: boolean;
}

declare module "fastify" {
  interface FastifyRequest {
    user: JwtUser;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtUser;
    user: JwtUser;
  }
}

export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: "Unauthorized" });
  }
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (!request.user.isAdmin && request.user.role !== "ADMIN") {
    reply.code(403).send({ error: "Forbidden" });
    return false;
  }
  return true;
}
