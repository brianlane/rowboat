import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { decodeJwt } from "jose";
import { buildWebhookRequest } from "./webhook-request";
import { ApiRequest } from "../../../../app/lib/types/api_types";

const baseArgs = {
    requestId: "req-123",
    toolCallId: "call-456",
    content: JSON.stringify({ toolCall: { id: "call-456" } }),
    projectId: "proj-789",
    webhookUrl: "https://example.com/webhook",
    secret: "test-secret",
};

describe("buildWebhookRequest", () => {
    it("includes jobId in the POST body and JWT claims when set", async () => {
        const { request, jwt } = await buildWebhookRequest({
            ...baseArgs,
            jobId: "job-abc",
        });

        assert.equal(request.jobId, "job-abc");
        assert.equal(request.requestId, "req-123");
        assert.equal(request.content, baseArgs.content);

        const claims = decodeJwt(jwt) as Record<string, unknown>;
        assert.equal(claims.jobId, "job-abc");
        assert.equal(claims.requestId, "req-123");
        assert.equal(claims.projectId, "proj-789");
        assert.equal(
            claims.bodyHash,
            crypto.createHash("sha256").update(baseArgs.content, "utf8").digest("hex"),
        );
    });

    it("leaves the POST body and JWT claims unchanged when jobId is unset", async () => {
        const { request, jwt } = await buildWebhookRequest(baseArgs);

        assert.deepEqual(Object.keys(request).sort(), ["content", "requestId"]);
        assert.equal("jobId" in request, false);

        const claims = decodeJwt(jwt) as Record<string, unknown>;
        assert.equal("jobId" in claims, false);
        assert.equal(claims.requestId, "req-123");
        assert.equal(claims.projectId, "proj-789");
        assert.equal(
            claims.bodyHash,
            crypto.createHash("sha256").update(baseArgs.content, "utf8").digest("hex"),
        );
    });
});

describe("ApiRequest", () => {
    it("accepts an optional jobId", () => {
        const parsed = ApiRequest.parse({
            messages: [],
            jobId: "job-abc",
        });
        assert.equal(parsed.jobId, "job-abc");
    });

    it("parses without jobId", () => {
        const parsed = ApiRequest.parse({ messages: [] });
        assert.equal(parsed.jobId, undefined);
    });
});
