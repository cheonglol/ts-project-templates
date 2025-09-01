import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { Response } from "../class/common/response.class";

const responseFormatterPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook("onSend", async (_request: FastifyRequest, _reply: FastifyReply, payload) => {
    // Skip if already a Response instance
    if (payload && typeof payload === "string") {
      try {
        const parsed = JSON.parse(payload);
        if (parsed.content !== undefined && parsed.status !== undefined && parsed.timestamp !== undefined) {
          return payload; // Already a Response-like object
        }
      } catch (error: unknown) {
        // If JSON parsing fails, it's not a structured response
        // This is expected for non-JSON payloads, so we just continue
        if (fastify.log) {
          fastify.log.debug("Non-JSON payload detected: " + (error instanceof Error ? error.message : String(error)));
        }
      }
    }

    // Transform to Response if it's not already
    if (payload !== undefined && payload !== null) {
      const content = typeof payload === "string" ? payload : "Success";
      const responseObj = new Response({
        content,
        metadata: typeof payload === "object" ? (payload as Record<string, unknown>) : undefined,
      });

      return JSON.stringify(responseObj);
    }

    return payload;
  });
};

export default fp(responseFormatterPlugin);
