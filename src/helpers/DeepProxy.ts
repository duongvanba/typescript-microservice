


export class DeepProxy {

    #options: { [key: string]: any } = {}

    constructor(
        private options_list: string[],
        private handler: (options) => any
    ) { }


    nest() {
        return new Proxy(this, {
            get: (_, method: string) => {
                if (this.options_list.includes(method)) {
                    return value => {
                        this.#options[method] = value
                        return this.nest()
                    }
                }
                return this.handler(this.#options)
            }
        })
    }
} 