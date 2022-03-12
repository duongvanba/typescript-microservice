export type DecoratorOptions<T = any> = {
    prototype: any,
    method: string,
    options: T
}

export type DecoratorTrigger<T = any> = DecoratorOptions<T> & {
    callback: (list: DecoratorOptions<T>[]) => any
}

export class DecoratorBuilder {

    #key = Symbol()

    static array_metadata_append<T>(key: Symbol, value: T, target) {
        const arr = Reflect.getMetadata(key, target) as T[] || []
        arr.push(value)
        Reflect.defineMetadata(key, arr, target)
    }

    createPropertyDecorator<T>(callback: (list: DecoratorOptions<T>[]) => any) {

        const key = Symbol()

        const decorator = (options: T) => (prototype, method) => {
            DecoratorBuilder.array_metadata_append(key, { method, ...options }, prototype)
            DecoratorBuilder.array_metadata_append<DecoratorTrigger<T>>(
                key,
                {
                    prototype,
                    method,
                    callback,
                    options
                },
                prototype
            )
        }

        const list = target => Reflect.getMetadata(key, target) as Array<T & { method: string }>

        return [decorator, list] as [typeof decorator, typeof list]
    }

    getClassDecorator() {

        const key = this.#key

        return C => class extends C {
            constructor(...args) {
                super(...args)

                setImmediate(async () => {
                    const list = Reflect.getMetadata(key, this) as DecoratorTrigger[]
                    for (const { prototype, callback, method, options } of list) {
                        await callback.call(this, prototype, method, options ?? null)
                    }
                })
                
            }
        }
    }


}