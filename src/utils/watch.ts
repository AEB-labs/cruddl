export class Watch {
    private lastTime: number;
    timings: { [key: string]: number } = {};

    /**
     * Creates and starts a watch
     */
    constructor() {
        this.lastTime = getPreciseTime();
    }

    stop(name: string) {
        const currentTime = getPreciseTime();
        this.timings[name] = currentTime - this.lastTime;
        this.lastTime = currentTime;
    }
}

export function getPreciseTime() {
    const hrTime = process.hrtime();
    return hrTime[0] + hrTime[1] / 1000000000;
}
