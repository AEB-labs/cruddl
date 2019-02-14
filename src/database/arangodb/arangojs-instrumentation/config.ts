export const requestInstrumentationBodyKey = 'cruddlRequestInstrumentation';

export type RequestInstrumentationPhase = 'queuing' | 'socketInit' | 'lookup' | 'connecting' | 'waiting' | 'receiving';

export interface RequestInstrumentation {
    onPhaseEnded(phase: RequestInstrumentationPhase): void

    readonly cancellationToken: Promise<void>
    /**
     * is set to true by custom-connection on cancellationToken.then() to allow synchronous access to the cancellation state
     */
    isCancelled?: boolean
}
