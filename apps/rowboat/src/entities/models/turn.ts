import { Message } from "@/app/lib/types/types";
import { z } from "zod";

// Caller-supplied turn id, shared by ApiRequest and Turn.input. Must be a
// UUID, max 64 characters, no whitespace, matching newCoworker's contract
// (src/lib/rowboat/webhook-jwt.ts: dashboard chat job ids are UUIDs;
// anything else in the claim fails the whole signed tool call).
export const JobId = z.string().max(64).uuid();

const chatReason = z.object({
    type: z.literal("chat"),
});

const apiReason = z.object({
    type: z.literal("api"),
});

const jobReason = z.object({
    type: z.literal("job"),
    jobId: z.string(),
});

export const Reason = z.discriminatedUnion("type", [
    chatReason,
    apiReason,
    jobReason,
]);

export const Turn = z.object({
    id: z.string(),
    reason: Reason,
    input: z.object({
        messages: z.array(Message),
        mockTools: z.record(z.string(), z.string()).nullable().optional(),
        // Per-turn start-agent override (see ApiRequest.startAgent).
        startAgent: z.string().nullable().optional(),
        // Optional caller-supplied id for this turn, forwarded on webhook
        // tool calls. Opaque to rowboat; unrelated to scheduled-job ids.
        // Must be a UUID (see JobId): newCoworker fails the whole signed
        // tool call when jobId is not a UUID, so a bad value must never
        // reach it. An empty string is rejected here, matching ApiRequest,
        // so it can never silently run without the requested job scope
        // downstream.
        jobId: JobId.optional(),
    }),
    output: z.array(Message),
    error: z.string().optional(),
    isBillingError: z.boolean().optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime().optional(),
});

export const CachedTurnRequest = z.object({
    conversationId: z.string(),
    input: Turn.shape.input,
});

export const TurnEvent = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("message"),
        data: Message,
    }),
    z.object({
        type: z.literal("error"),
        error: z.string(),
        isBillingError: z.boolean().optional(),
    }),
    z.object({
        type: z.literal("done"),
        conversationId: z.string(),
        turn: Turn,
    }),
]);