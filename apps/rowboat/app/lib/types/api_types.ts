import { Message } from "./types";
import { Turn } from "@/src/entities/models/turn";
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
});export const ApiResponse = z.object({
    turn: Turn,
    conversationId: z.string().optional(),
});

