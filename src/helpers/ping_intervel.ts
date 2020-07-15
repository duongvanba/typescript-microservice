export function PingInterval(delay: number, fn: Function) {
    const jobid = setInterval(fn, delay)
    fn()
    return {
        done: () => clearInterval(jobid)
    }
}