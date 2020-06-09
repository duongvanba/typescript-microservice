export function rateLimit<T extends Function>(limit: number, func: T) {

    const queue: Array<{ args: any[], thiss: any, success: Function, reject: Function }> = []

    let running = false

    const excute = async () => {
        if (running) return
        running = true
        while (queue.length > 0) {
            const sliced = queue.splice(0, limit)
            const promises = await Promise.all(sliced.map(async task => {
                try {
                    task.success(await func.apply(task.thiss, task.args))
                } catch (e) {
                    task.reject(e)
                }
            }))
            await Promise.all(promises)
        }
        running = false
    }


    return new Proxy(() => { }, {
        apply: (_, thiss, args) => new Promise((success, reject) => {
            queue.push({ args, reject, success, thiss })
            excute()
        })
    }) as any as T
}