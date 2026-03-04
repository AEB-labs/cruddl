export function generateRandomString(length: number): string {
    return Array(Math.floor(length / 2))
        .fill(0)
        .map(() => Math.floor(Math.random() * 256))
        .map((b) => ('0' + b.toString(16)).slice(-2))
        .join('');
}
