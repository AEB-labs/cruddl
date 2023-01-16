/**
 * Source: https://github.com/arangodb/arangojs
 *
 * Originally licensed under Apache License 2.0
 */

import { joinPath } from 'arangojs/lib/joinPath';
import { Errback } from 'arangojs/lib/errback';
import { omit } from 'arangojs/lib/omit';
import {
    Agent as HttpAgent,
    ClientRequest,
    ClientRequestArgs,
    IncomingMessage,
    request as httpRequest,
} from 'http';
import { Agent as HttpsAgent, request as httpsRequest } from 'https';
import { Socket } from 'net';
import { parse as parseUrl, UrlWithStringQuery } from 'url';
import { RequestInstrumentation, RequestInstrumentationPhase } from './config';
import { SystemError } from 'arangojs/error';
import { RequestOptions as ArangoRequestOptions } from 'arangojs/lib/request.node';

/**
 * @internal
 */
function systemErrorToJSON(this: SystemError) {
    return {
        error: true,
        errno: this.errno,
        code: this.code,
        syscall: this.syscall,
    };
}

/**
 * @internal
 */
export interface ArangojsResponse extends IncomingMessage {
    request: ClientRequest;
    body?: any;
    arangojsHostUrl?: string;
}

/**
 * @internal
 */
export interface ArangojsError extends Error {
    request: ClientRequest;
    toJSON: () => Record<string, any>;
}

export interface RequestOptions extends ArangoRequestOptions {
    requestInstrumentation?: RequestInstrumentation;
}

/**
 * @internal
 */
export type RequestFunction = {
    (options: RequestOptions, cb: Errback<ArangojsResponse>): void;
    close?: () => void;
};

/**
 * collects sockets we already took the lookup/connect events from
 * this is important to not re-add the listeners when sockets are being reused
 */
const knownSockets = new WeakSet<Socket>();

export const isBrowser = false;

export function createRequest(baseUrl: string, agentOptions: any, agent: any): RequestFunction {
    const baseUrlParts = parseUrl(baseUrl) as Partial<UrlWithStringQuery>;
    if (!baseUrlParts.protocol) {
        throw new Error(`Invalid URL (no protocol): ${baseUrl}`);
    }
    const isTls = baseUrlParts.protocol === 'https:';
    let socketPath: string | undefined;
    if (baseUrl.startsWith(`${baseUrlParts.protocol}//unix:`)) {
        if (!baseUrlParts.pathname) {
            throw new Error(
                `Unix socket URL must be in the format http://unix:/socket/path, http+unix:///socket/path or unix:///socket/path not ${baseUrl}`,
            );
        }
        const i = baseUrlParts.pathname.indexOf(':');
        if (i === -1) {
            socketPath = baseUrlParts.pathname;
            delete baseUrlParts.pathname;
        } else {
            socketPath = baseUrlParts.pathname.slice(0, i);
            baseUrlParts.pathname = baseUrlParts.pathname.slice(i + 1);
            if (baseUrlParts.pathname === '') {
                delete baseUrlParts.pathname;
            }
        }
    }
    if (socketPath && !socketPath.replace(/\//g, '').length) {
        throw new Error(`Invalid URL (empty unix socket path): ${baseUrl}`);
    }
    if (!agent) {
        const opts = omit(agentOptions, ['before', 'after']);
        if (isTls) agent = new HttpsAgent(opts);
        else agent = new HttpAgent(opts);
    }

    return Object.assign(
        function request(
            { method, url, headers, body, timeout, requestInstrumentation }: RequestOptions,
            callback: Errback<ArangojsResponse>,
        ) {
            // this is the last change we cancel a request
            // we don't cancel running requests because arangodb does not kill queries when the request ist terminated
            // thus, we keep the request open
            // - to get notified if the request completes pretty quickly anyway so we don't need to kill the query
            // - to take up a socket so that no new query is sent on it while the query is not yet killed
            if (requestInstrumentation && requestInstrumentation.isCancelled) {
                return callback(
                    new Error(`Request has been cancelled by caller before it was sent`),
                );
            }

            notifyAboutPhaseEnd(requestInstrumentation, 'queuing');

            let path = baseUrlParts.pathname
                ? url.pathname
                    ? joinPath(baseUrlParts.pathname, url.pathname)
                    : baseUrlParts.pathname
                : url.pathname;
            const search = url.search
                ? baseUrlParts.search
                    ? `${baseUrlParts.search}&${url.search.slice(1)}`
                    : url.search
                : baseUrlParts.search;
            if (search) path += search;
            if (body && !headers['content-length']) {
                headers['content-length'] = String(Buffer.byteLength(body));
            }
            if (!headers['authorization']) {
                const encoded = Buffer.from(baseUrlParts.auth || 'root:').toString('base64');
                headers['authorization'] = `Basic ${encoded}`;
            }
            const options: ClientRequestArgs = { path, method, headers, agent };
            if (socketPath) {
                options.socketPath = socketPath;
            } else {
                options.host = baseUrlParts.hostname;
                options.port = baseUrlParts.port;
            }
            let called = false;

            try {
                const req = (isTls ? httpsRequest : httpRequest)(
                    options,
                    (res: IncomingMessage) => {
                        notifyAboutPhaseEnd(requestInstrumentation, 'waiting');
                        const data: Buffer[] = [];
                        res.on('data', (chunk) => data.push(chunk as Buffer));
                        res.on('end', () => {
                            const response = res as ArangojsResponse;
                            response.request = req;
                            response.body = Buffer.concat(data);
                            if (called) return;
                            called = true;
                            if (agentOptions.after) {
                                agentOptions.after(null, response);
                            }
                            notifyAboutPhaseEnd(requestInstrumentation, 'receiving');
                            callback(null, response);
                        });
                    },
                );
                if (requestInstrumentation) {
                    req.on('socket', (socket: Socket) => {
                        notifyAboutPhaseEnd(requestInstrumentation, 'socketInit');
                        if (knownSockets.has(socket)) {
                            return;
                        }
                        knownSockets.add(socket);
                        socket.on('lookup', () =>
                            notifyAboutPhaseEnd(requestInstrumentation, 'lookup'),
                        );
                        socket.on('connect', () =>
                            notifyAboutPhaseEnd(requestInstrumentation, 'connecting'),
                        );
                    });
                }
                if (timeout) {
                    req.setTimeout(timeout);
                }
                req.on('timeout', () => {
                    req.abort();
                });
                req.on('error', (err) => {
                    const error = err as ArangojsError;
                    error.request = req;
                    error.toJSON = systemErrorToJSON;
                    if (called) return;
                    called = true;
                    if (agentOptions.after) {
                        agentOptions.after(error);
                    }
                    callback(error);
                });
                if (body) req.write(body);
                if (agentOptions.before) {
                    agentOptions.before(req);
                }
                req.end();
            } catch (e: any) {
                if (called) return;
                called = true;
                setTimeout(() => {
                    callback(e);
                }, 0);
            }
        },
        {
            close() {
                agent.destroy();
            },
        },
    );
}

function notifyAboutPhaseEnd(
    requestInstrumentation: RequestInstrumentation | undefined,
    phase: RequestInstrumentationPhase,
) {
    if (!requestInstrumentation) {
        return;
    }
    requestInstrumentation.onPhaseEnded(phase);
}
