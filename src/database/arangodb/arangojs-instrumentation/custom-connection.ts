import { Config, Connection, RequestOptions } from 'arangojs/connection';
import { ArangoError, HttpError, isArangoErrorResponse } from 'arangojs/error';
import { normalizeUrl } from 'arangojs/lib/normalizeUrl';
import { ArangojsResponse } from 'arangojs/lib/request';
import { RequestInstrumentation, requestInstrumentationBodyKey } from './config';
import { createRequest } from './custom-request';

const MIME_JSON = /\/(json|javascript)(\W|$)/;

export class CustomConnection extends Connection {
    constructor(config?: Config) {
        super(config);
    }

    request<T = ArangojsResponse>(
        {
            host,
            method = 'GET',
            body,
            expectBinary = false,
            isBinary = false,
            allowDirtyRead = false,
            headers,
            ...urlInfo
        }: RequestOptions,
        transform?: (res: ArangojsResponse) => T,
    ): Promise<T> {
        let requestInstrumentation: RequestInstrumentation | undefined;
        if (
            typeof body === 'object' &&
            typeof body.params === 'object' &&
            requestInstrumentationBodyKey in body.params
        ) {
            requestInstrumentation = body.params[requestInstrumentationBodyKey];
            delete body.params[requestInstrumentationBodyKey];
        }

        if (requestInstrumentation && requestInstrumentation.cancellationToken) {
            let ri = requestInstrumentation;
            requestInstrumentation.cancellationToken.then(() => (ri.isCancelled = true));
        }

        return new Promise((resolve, reject) => {
            let contentType = 'text/plain';
            if (isBinary) {
                contentType = 'application/octet-stream';
            } else if (body) {
                if (typeof body === 'object') {
                    body = JSON.stringify(body);
                    contentType = 'application/json';
                } else {
                    body = String(body);
                }
            }

            const extraHeaders: { [key: string]: string } = {
                ...(this as any)._headers,
                'content-type': contentType,
                'x-arango-version': String((this as any)._arangoVersion),
            };
            if (this._transactionId) {
                extraHeaders['x-arango-trx-id'] = this._transactionId;
            }
            const task = {
                retries: 0,
                host,
                allowDirtyRead,
                options: {
                    url: (this as any)._buildUrl(urlInfo),
                    headers: { ...extraHeaders, ...headers },
                    method,
                    expectBinary,
                    body,
                    requestInstrumentation,
                },
                stack: undefined as unknown as () => string | undefined,
                reject,
                resolve: (res: ArangojsResponse) => {
                    const contentType = res.headers['content-type'];
                    let parsedBody: any = undefined;
                    if (res.body.length && contentType && contentType.match(MIME_JSON)) {
                        try {
                            parsedBody = res.body;
                            parsedBody = JSON.parse(parsedBody);
                        } catch (e: any) {
                            if (!expectBinary) {
                                if (typeof parsedBody !== 'string') {
                                    parsedBody = res.body.toString('utf-8');
                                }
                                e.response = res;
                                if (task.stack) {
                                    e.stack += task.stack();
                                }
                                reject(e);
                                return;
                            }
                        }
                    } else if (res.body && !expectBinary) {
                        parsedBody = res.body.toString('utf-8');
                    } else {
                        parsedBody = res.body;
                    }
                    if (isArangoErrorResponse(parsedBody)) {
                        res.body = parsedBody;
                        const err = new ArangoError(res);
                        if (task.stack) {
                            (err.stack as string) += task.stack();
                        }
                        reject(err);
                    } else if (res.statusCode && res.statusCode >= 400) {
                        res.body = parsedBody;
                        const err = new HttpError(res);
                        if (task.stack) {
                            (err.stack as string) += task.stack();
                        }
                        reject(err);
                    } else {
                        if (!expectBinary) res.body = parsedBody;
                        resolve(transform ? transform(res) : (res as any));
                    }
                },
            };

            if (this._precaptureStackTraces) {
                if (typeof Error.captureStackTrace === 'function') {
                    const capture = {} as { readonly stack: string };
                    Error.captureStackTrace(capture);
                    task.stack = () => `\n${capture.stack.split('\n').slice(3).join('\n')}`;
                } else {
                    const capture = generateStackTrace() as { readonly stack: string };
                    if (Object.prototype.hasOwnProperty.call(capture, 'stack')) {
                        task.stack = () => `\n${capture.stack.split('\n').slice(4).join('\n')}`;
                    }
                }
            }

            this._queue.push(task as any);
            this._runQueue();
        });
    }

    addToHostList(urls: string | string[]): number[] {
        const cleanUrls = (Array.isArray(urls) ? urls : [urls]).map((url) => normalizeUrl(url));
        const newUrls = cleanUrls.filter((url) => this._urls.indexOf(url) === -1);
        this._urls.push(...newUrls);
        this._hosts.push(
            ...newUrls.map((url: string) => createRequest(url, this._agentOptions, this._agent)),
        );
        return cleanUrls.map((url) => this._urls.indexOf(url));
    }
}

function generateStackTrace() {
    let err = new Error();
    if (!err.stack) {
        try {
            throw err;
        } catch (e: any) {
            err = e;
        }
    }
    return err;
}
