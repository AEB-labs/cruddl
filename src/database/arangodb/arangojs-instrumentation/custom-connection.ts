import { Config, Connection, RequestOptions } from 'arangojs/connection';
import { normalizeUrl } from 'arangojs/lib/normalizeUrl';
import { ArangojsResponse } from 'arangojs/lib/request';
import { RequestInstrumentation, requestInstrumentationBodyKey } from './config';
import { createRequest, RequestOptions as CustomRequestOptions } from './custom-request';
import { isReadonlyArray } from '../../../utils/utils';

/**
 * @internal
 */
type Task = {
    hostUrl?: string;
    stack?: () => string;
    allowDirtyRead: boolean;
    retryOnConflict: number;
    resolve: (result: any) => void;
    reject: (error: Error) => void;
    transform?: (res: ArangojsResponse) => any;
    retries: number;
    options: CustomRequestOptions;
};

export class CustomConnection extends Connection {
    constructor(config?: Config) {
        super(config);
    }

    request<T = ArangojsResponse>(
        {
            hostUrl,
            method = 'GET',
            body,
            expectBinary = false,
            isBinary = false,
            allowDirtyRead = false,
            retryOnConflict = this._retryOnConflict,
            timeout = 0,
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
            const task: Task = {
                retries: 0,
                hostUrl,
                allowDirtyRead,
                retryOnConflict,
                options: {
                    url: (this as any)._buildUrl(urlInfo),
                    headers: { ...extraHeaders, ...headers },
                    method,
                    expectBinary,
                    body,
                    requestInstrumentation,
                },
                reject,
                resolve,
                transform,
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

    addToHostList(urls: string | ReadonlyArray<string>): string[] {
        const cleanUrls = (isReadonlyArray(urls) ? urls : [urls]).map((url) => normalizeUrl(url));
        const newUrls = cleanUrls.filter((url) => this._hostUrls.indexOf(url) === -1);
        this._hostUrls.push(...newUrls);
        this._hosts.push(
            ...newUrls.map((url: string) => createRequest(url, this._agentOptions, this._agent)),
        );
        return cleanUrls;
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
