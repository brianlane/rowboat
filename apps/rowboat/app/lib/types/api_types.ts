import { Message } from "./types";
import { JobId, Turn } from "@/src/entities/models/turn";
import { z } from "zod";

export const ApiRequest = z.object({
    messages: z.array(Message),
    conversationId: z.string().nullable().optional(),
    mockTools: z.record(z.string(), z.string()).nullable().optional(),
    stream: z.boolean().optional().nullable().default(false),
    // Per-turn start-agent override. API callers that host multiple
    // surfaces in one workflow (e.g. an SMS agent and an owner-dashboard
    // agent) use this to enter the right agent on stateless turns instead
    // of always landing on workflow.startAgent.
    startAgent: z.string().nullable().optional(),
    // Optional caller-supplied id for this turn. When set, it is forwarded on
    // webhook tool calls (POST body and JWT claims) so a downstream receiver
    // can scope a lookup to this one turn instead of the whole project.
    // It is opaque to rowboat and unrelated to rowboat's scheduled-job ids.
    // Must be a UUID (see JobId): newCoworker fails the whole signed tool
    // call when jobId is not a UUID, so a bad value must never reach it.
    // An empty string is rejected here so it can never silently run without
    // the requested job scope downstream.
    jobId: JobId.optional(),
});export const ApiResponse = z.object({
    turn: Turn,
    conversationId: z.string().optional(),
});

