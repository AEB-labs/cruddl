import { Config, Connection } from 'arangojs/lib/async/connection';
import { ArangoError, HttpError } from 'arangojs/lib/async/error';
import { ArangojsResponse } from 'arangojs/lib/async/util/request.node';
import { sanitizeUrl } from 'arangojs/lib/async/util/sanitizeUrl';
import { RequestInstrumentation, requestInstrumentationBodyKey } from './config';
import { createRequest } from './custom-request';

const MIME_JSON = /\/(json|javascript)(\W|$)/;

export type RequestOptions = {
    host?: number;
    method?: string;
    body?: any;
    expectBinary?: boolean;
    isBinary?: boolean;
    allowDirtyRead?: boolean;
    headers?: { [key: string]: string };
    absolutePath?: boolean;
    basePath?: string;
    path?: string;
    qs?: string | { [key: string]: any };
    requestInstrumentation?: RequestInstrumentation
};

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
        getter?: (res: ArangojsResponse) => T
    ): Promise<T> {
        let requestInstrumentation: RequestInstrumentation | undefined;
        if (typeof body === 'object' && typeof body.params === 'object' && requestInstrumentationBodyKey in body.params) {
            requestInstrumentation = body.params[requestInstrumentationBodyKey];
            delete body.params[requestInstrumentationBodyKey];
        }

        if (requestInstrumentation && requestInstrumentation.cancellationToken) {
            let ri = requestInstrumentation;
            requestInstrumentation.cancellationToken.then(() => ri.isCancelled = true);
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
                'x-arango-version': String((this as any)._arangoVersion)
            };

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
                    requestInstrumentation
                },
                reject,
                resolve: (res: ArangojsResponse) => {
                    const contentType = res.headers['content-type'];
                    let parsedBody: any = undefined;
                    if (res.body.length && contentType && contentType.match(MIME_JSON)) {
                        try {
                            parsedBody = res.body;
                            parsedBody = JSON.parse(parsedBody);
                        } catch (e) {
                            if (!expectBinary) {
                                if (typeof parsedBody !== 'string') {
                                    parsedBody = res.body.toString('utf-8');
                                }
                                e.response = res;
                                reject(e);
                                return;
                            }
                        }
                    } else if (res.body && !expectBinary) {
                        parsedBody = res.body.toString('utf-8');
                    } else {
                        parsedBody = res.body;
                    }
                    if (
                        parsedBody &&
                        parsedBody.hasOwnProperty('error') &&
                        parsedBody.hasOwnProperty('code') &&
                        parsedBody.hasOwnProperty('errorMessage') &&
                        parsedBody.hasOwnProperty('errorNum')
                    ) {
                        res.body = parsedBody;
                        reject(new ArangoError(res));
                    } else if (res.statusCode && res.statusCode >= 400) {
                        res.body = parsedBody;
                        reject(new HttpError(res));
                    } else {
                        if (!expectBinary) {
                            res.body = parsedBody;
                        }
                        resolve(getter ? getter(res) : (res as any));
                    }
                }
            };
            (this as any)._queue.push(task);
            (this as any)._runQueue();
        });
    }

    addToHostList(urls: string | string[]): number[] {
        const cleanUrls = (Array.isArray(urls) ? urls : [urls]).map(url => sanitizeUrl(url));
        const newUrls = cleanUrls.filter(url => (this as any)._urls.indexOf(url) === -1);
        (this as any)._urls.push(...newUrls);
        (this as any)._hosts.push(
            ...newUrls.map((url: string) =>
                createRequest(url, (this as any)._agentOptions, (this as any)._agent)
            )
        );
        return cleanUrls.map(url => (this as any)._urls.indexOf(url));
    }
}
