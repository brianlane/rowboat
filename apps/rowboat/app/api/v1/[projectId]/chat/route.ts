import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiResponse } from "@/app/lib/types/api_types";
import { ApiRequest } from "@/app/lib/types/api_types";
import { PrefixLogger } from "../../../../lib/utils";
import { container } from "@/di/container";
import { IRunTurnController } from "@/src/interface-adapters/controllers/conversations/run-turn.controller";

// get next turn / agent response
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
): Promise<Response> {
    const { projectId } = await params;
    const requestId = crypto.randomUUID();
    const logger = new PrefixLogger(`${requestId}`);

    // parse and validate the request body
    let data;
    try {
        const body = await req.json();
        data = ApiRequest.parse(body);
    } catch (e) {
        logger.log(`Invalid JSON in request body: ${e}`);
        return Response.json({ error: "Invalid request" }, { status: 400 });
    }
    const { conversationId, messages, mockTools, stream, startAgent, jobId } = data;

    const runTurnController = container.resolve<IRunTurnController>("runTurnController");

    // get assistant response
    //
    // Wrapped so a failed turn returns a JSON error body instead of the
    // framework's bare 500: downstream consumers (the VPS chat-worker's
    // `rowboat_http_<status>:<body>` error taxonomy) log the body as the
    // failure detail, and an empty body made incidents like the stuck
    // empty-completion loop ("Max turns (25) exceeded", 2026-07-19) opaque
    // in the platform's System Errors feed.
    let response;
    try {
        response = await runTurnController.execute({
            caller: "api",
            apiKey: req.headers.get("Authorization")?.split(" ")[1],
            projectId,
            input: {
                messages,
                mockTools,
                startAgent,
                jobId,
            },
            conversationId: conversationId || undefined,
            stream: Boolean(stream),
        });
    } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logger.log(`Turn failed: ${message}`);
        return Response.json({ error: message }, { status: 500 });
    }

    // if streaming is requested, return SSE stream
    if (stream && 'stream' in response) {
        const encoder = new TextEncoder();
        
        const readableStream = new ReadableStream({
            async start(controller) {
                try {
                    // Iterate over the generator
                    for await (const event of response.stream) {
                        controller.enqueue(encoder.encode(`event: message\ndata: ${JSON.stringify(event)}\n\n`));
                    }
                    controller.close();
                } catch (error) {
                    logger.log(`Error processing stream: ${error}`);
                    controller.error(new Error("Something went wrong. Please try again."));
                }
            },
        });
        
        return new Response(readableStream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });
    }

    // non-streaming response (existing behavior)
    if (!('turn' in response)) {
        logger.log(`No turn data found in response`);
        return Response.json({ error: "No turn data found in response" }, { status: 500 });
    }

    const responseBody: z.infer<typeof ApiResponse> = {
        conversationId: response.conversationId,
        turn: response.turn,
    };
    return Response.json(responseBody);
}
