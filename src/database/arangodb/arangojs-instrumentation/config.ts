export const requestInstrumentationBodyKey = 'cruddlRequestInstrumentation';

export type RequestInstrumentationPhase = 'queuing' | 'socketInit' | 'lookup' | 'connecting' | 'waiting' | 'receiving';

export interface RequestInstrumentation {
    onPhaseEnded(phase: RequestInstrumentationPhase): void

    cancellationToken: Promise<void>
}
