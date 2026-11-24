import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { decodeJwt } from "jose";
import { asValue } from "awilix";
import { buildWebhookRequest } from "./webhook-request";
import { invokeWebhookTool } from "./agent-tools";
import { container } from "../../../../di/container";
import { PrefixLogger } from "../../../../app/lib/utils";
import { UsageTracker } from "../../../../app/lib/billing";
import { redisClient } from "../../../../app/lib/redis";
import { ApiRequest } from "../../../../app/lib/types/api_types";
import { Turn } from "../../../../src/entities/models/turn";

const baseArgs = {
    requestId: "req-123",
    toolCallId: "call-456",
    content: JSON.stringify({ toolCall: { id: "call-456" } }),
    projectId: "proj-789",
    webhookUrl: "https://example.com/webhook",
    secret: "test-secret",
};

// A valid jobId is a UUID, matching newCoworker's contract
// (src/lib/rowboat/webhook-jwt.ts: dashboard chat job ids are UUIDs;
// anything else in the claim fails the whole token).
const VALID_JOB_ID = "123e4567-e89b-12d3-a456-426614174000";

// Values that must be rejected as jobId because they are not UUIDs.
const INVALID_JOB_IDS = [
    ["whitespace only", "   "],
    ["newline", "123e4567-e89b-12d3-a456-426614174000\n"],
    ["65 characters", "a".repeat(65)],
    ["non-UUID", "job-abc"],
] as const;

describe("buildWebhookRequest", () => {
    it("includes jobId in the POST body and JWT claims when set", async () => {
        const { request, jwt } = await buildWebhookRequest({
            ...baseArgs,
            jobId: VALID_JOB_ID,
        });

        assert.equal(request.jobId, VALID_JOB_ID);
        assert.equal(request.requestId, "req-123");
        assert.equal(request.content, baseArgs.content);

        const claims = decodeJwt(jwt) as Record<string, unknown>;
        assert.equal(claims.jobId, VALID_JOB_ID);
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
            jobId: VALID_JOB_ID,
        });
        assert.equal(parsed.jobId, VALID_JOB_ID);
    });

    it("parses without jobId", () => {
        const parsed = ApiRequest.parse({ messages: [] });
        assert.equal(parsed.jobId, undefined);
    });

    it("rejects an empty jobId instead of silently dropping it", () => {
        assert.throws(() =>
            ApiRequest.parse({ messages: [], jobId: "" }),
        );
    });

    for (const [label, value] of INVALID_JOB_IDS) {
        it(`rejects ${label} as jobId`, () => {
            assert.throws(() =>
                ApiRequest.parse({ messages: [], jobId: value }),
            );
        });
    }
});

describe("Turn input", () => {
    it("accepts an optional jobId", () => {
        const parsed = Turn.shape.input.parse({
            messages: [],
            jobId: VALID_JOB_ID,
        });
        assert.equal(parsed.jobId, VALID_JOB_ID);
    });

    it("parses without jobId", () => {
        const parsed = Turn.shape.input.parse({ messages: [] });
        assert.equal(parsed.jobId, undefined);
    });

    it("rejects an empty jobId, matching ApiRequest", () => {
        assert.throws(() =>
            Turn.shape.input.parse({ messages: [], jobId: "" }),
        );
    });

    for (const [label, value] of INVALID_JOB_IDS) {
        it(`rejects ${label} as jobId, matching ApiRequest`, () => {
            assert.throws(() =>
                Turn.shape.input.parse({ messages: [], jobId: value }),
            );
        });
    }
});

// The webhook call with jobId must still go through the SSRF check that
// the upgrades branch added: invokeWebhookTool validates the project's
// webhook URL before building the request or fetching, so a private URL
// is rejected even when a jobId is set. These tests stub the projects
// repository in the DI container and prove no fetch happens.
describe("invokeWebhookTool SSRF check with jobId", () => {
    const logger = new PrefixLogger("test");
    const usageTracker = new UsageTracker();

    // Importing the DI container also creates the module-level Redis client,
    // whose reconnect loop would keep the test process alive forever when
    // no Redis is reachable. Disconnect it so the runner can exit.
    after(() => {
        redisClient.disconnect();
    });

    function stubProjectRepository(webhookUrl: string) {
        container.register({
            projectsRepository: asValue({
                fetch: async () => ({ webhookUrl, secret: "test-secret" }),
            }),
        });
    }

    function stubFetch() {
        const calls: unknown[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (...args: unknown[]) => {
            calls.push(args);
            throw new Error("fetch must not be called for a blocked webhook URL");
        }) as typeof fetch;
        return {
            calls,
            restore: () => {
                globalThis.fetch = originalFetch;
            },
        };
    }

    it("rejects a loopback webhook URL before fetching, even with jobId set", async () => {
        stubProjectRepository("http://127.0.0.1:9999/hook");
        const fetchStub = stubFetch();
        try {
            await assert.rejects(
                () =>
                    invokeWebhookTool(
                        logger,
                        usageTracker,
                        "proj-789",
                        "test-tool",
                        { foo: "bar" },
                        VALID_JOB_ID,
                    ),
                /localhost/,
            );
            assert.equal(fetchStub.calls.length, 0);
        } finally {
            fetchStub.restore();
        }
    });
});
