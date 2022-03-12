
export class DecoratorBuilder {

    static createPropertyDecorator<T>(callback: (args: { prototype, method: string, options: T }) => any) {

        const key = Symbol()

        const list = target => Reflect.getMetadata(key, target) as Array<{ prototype, method: string, options: T }> || []

        const decorator = (options: T = {} as any) => (prototype, method) => {
            const metadata_array = list(prototype)
            metadata_array.push({ prototype, method, options })
            Reflect.defineMetadata(key, metadata_array, prototype)
        }

        const activator = async target => {
            for (const { method, prototype, options } of list(target)) {
                await callback.bind(target)({ prototype, method, options })
            }
        }

        return [decorator, list, activator] as [typeof decorator, typeof list, typeof activator]

    }

    static createClassDecorator(cb?: (target) => any) {

        return () => C => {
            const N = {
                [C.name]: class extends C {
                    constructor(...args) {
                        super(...args)
                        cb?.(this)
                    }
                }
            }
            return N[C.name] as any
        }

    }
}