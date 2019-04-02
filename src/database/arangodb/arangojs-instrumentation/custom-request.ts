/**
 * Source: https://github.com/arangodb/arangojs
 *
 * Originally licensed under Apache License 2.0
 */

import { btoa } from 'arangojs/lib/async/util/btoa';
import { joinPath } from 'arangojs/lib/async/util/joinPath';
import { Errback } from 'arangojs/lib/async/util/types';
import { Agent as HttpAgent, ClientRequest, ClientRequestArgs, IncomingMessage, request as httpRequest } from 'http';
import { Agent as HttpsAgent, request as httpsRequest } from 'https';
import { Socket } from 'net';
import { parse as parseUrl, Url } from 'url';
import { RequestInstrumentation, RequestInstrumentationPhase } from './config';

export type ArangojsResponse = IncomingMessage & {
    request: ClientRequest;
    body?: any;
    host?: number;
};

export type ArangojsError = Error & {
    request: ClientRequest;
};

export interface RequestOptions {
    method: string;
    url: Url;
    headers: { [key: string]: string };
    body: any;
    expectBinary: boolean;
    requestInstrumentation?: RequestInstrumentation
}

export interface RequestFunction {
    (opts: RequestOptions, cb: Errback<ArangojsResponse>): void;

    close?: () => void;
}

/**
 * collects sockets we already took the lookup/connect events from
 * this is important to not re-add the listeners when sockets are being reused
 */
const knownSockets = new WeakSet<Socket>();

export const isBrowser = false;

export function createRequest(
    baseUrl: string,
    agentOptions: any,
    agent: any
): RequestFunction {
    const baseUrlParts = parseUrl(baseUrl);
    if (!baseUrlParts.protocol) {
        throw new Error(`Invalid URL (no protocol): ${baseUrl}`);
    }
    const isTls = baseUrlParts.protocol === 'https:';
    let socketPath: string | undefined;
    if (baseUrl.startsWith(`${baseUrlParts.protocol}//unix:`)) {
        if (!baseUrlParts.pathname) {
            throw new Error(
                `Unix socket URL must be in the format http://unix:/socket/path, http+unix:///socket/path or unix:///socket/path not ${baseUrl}`
            );
        }
        const i = baseUrlParts.pathname.indexOf(':');
        if (i === -1) {
            socketPath = baseUrlParts.pathname;
            baseUrlParts.pathname = undefined;
        } else {
            socketPath = baseUrlParts.pathname.slice(0, i);
            baseUrlParts.pathname = baseUrlParts.pathname.slice(i + 1) || undefined;
        }
    }
    if (socketPath && !socketPath.replace(/\//g, '').length) {
        throw new Error(`Invalid URL (empty unix socket path): ${baseUrl}`);
    }
    if (!agent) {
        if (isTls) {
            agent = new HttpsAgent(agentOptions);
        } else {
            agent = new HttpAgent(agentOptions);
        }
    }
    return Object.assign(
        function request(
            { method, url, headers, body, requestInstrumentation }: RequestOptions,
            callback: Errback<ArangojsResponse>
        ) {
            let isCancelled = false;
            if (requestInstrumentation && requestInstrumentation.cancellationToken) {
                requestInstrumentation.cancellationToken.then(() => isCancelled = true);
            }
            if (isCancelled) {
                callback(new Error(`Request has been cancelled by caller before it was sent`));
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
            if (search) {
                path += search;
            }
            if (body && !headers['content-length']) {
                headers['content-length'] = String(Buffer.byteLength(body));
            }
            if (!headers['authorization']) {
                headers['authorization'] = `Basic ${btoa(
                    baseUrlParts.auth || 'root:'
                )}`;
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
                        res.on('data', chunk => data.push(chunk as Buffer));
                        res.on('end', () => {
                            const result = res as ArangojsResponse;
                            result.request = req;
                            result.body = Buffer.concat(data);
                            if (called) {
                                return;
                            }
                            called = true;
                            notifyAboutPhaseEnd(requestInstrumentation, 'receiving');
                            callback(null, result);
                        });
                    }
                );
                if (requestInstrumentation) {
                    req.on('socket', (socket: Socket) => {
                        notifyAboutPhaseEnd(requestInstrumentation, 'socketInit');
                        if (knownSockets.has(socket)) {
                            return;
                        }
                        knownSockets.add(socket);
                        socket.on('lookup', () => notifyAboutPhaseEnd(requestInstrumentation, 'lookup'));
                        socket.on('connect', () => notifyAboutPhaseEnd(requestInstrumentation, 'connecting'));
                    });

                    if (requestInstrumentation.cancellationToken) {
                        requestInstrumentation.cancellationToken.then(() => {
                            if (!called) {
                                req.abort();
                                called = true;
                                callback(new Error(`Request has been cancelled by caller`));
                            }
                        });
                    }
                }
                req.on('error', err => {
                    const error = err as ArangojsError;
                    error.request = req;
                    if (called) {
                        return;
                    }
                    called = true;
                    callback(err);
                });
                if (body) {
                    req.write(body);
                }
                req.end();
            } catch (e) {
                if (called) {
                    return;
                }
                called = true;
                callback(e);
            }
        },
        {
            close() {
                agent.destroy();
            }
        }
    );
}

function notifyAboutPhaseEnd(requestInstrumentation: RequestInstrumentation | undefined, phase: RequestInstrumentationPhase) {
    if (!requestInstrumentation) {
        return;
    }
    requestInstrumentation.onPhaseEnded(phase);
}
