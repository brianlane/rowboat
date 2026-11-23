import { SignJWT } from "jose";
import crypto from "crypto";

// Builds the signed webhook tool-call request.
//
// When jobId is set, it is included in both the POST body and the JWT
// claims so a downstream receiver can scope a lookup to this one turn
// (for example, when several worker chats overlap for the same project).
// When jobId is unset, the body and claims are exactly as before.
export async function buildWebhookRequest(args: {
    requestId: string;
    toolCallId: string;
    content: string;
    projectId: string;
    webhookUrl: string;
    secret: string;
    jobId?: string;
}): Promise<{ request: Record<string, string>; jwt: string }> {
    const { requestId, toolCallId, content, projectId, webhookUrl, secret, jobId } = args;

    const bodyHash = crypto
        .createHash('sha256')
        .update(content, 'utf8')
        .digest('hex');

    // sign request
    const jwt = await new SignJWT({
        requestId,
        projectId,
        bodyHash,
        ...(jobId ? { jobId } : {}),
    })
        .setProtectedHeader({
            alg: 'HS256',
            typ: 'JWT',
        })
        .setIssuer('rowboat')
        .setAudience(webhookUrl)
        .setSubject(`tool-call-${toolCallId}`)
        .setJti(requestId)
        .setIssuedAt()
        .setExpirationTime("5 minutes")
        .sign(new TextEncoder().encode(secret));

    // make request
    const request: Record<string, string> = {
        requestId,
        content,
        ...(jobId ? { jobId } : {}),
    };

    return { request, jwt };
}
