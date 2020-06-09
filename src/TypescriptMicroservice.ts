import { Transporter } from "./transporters/Transporter";
import { v4 } from 'uuid'
import { RpcServices } from "./db";
import { TOPIC_SUBSCRIBES, ALLOW_FROM_REMOTE_METHODS, ON_MICROSERVICE_READY } from "./symbol";
import { AllowFromRemoteOptions } from "./decorators/AllowFromRemote";
import { Encoder } from "./Encoder";
import { SubcribeTopicOptions } from "./decorators/SubcribeTopic";

const ResponseCallbackList = new Map<string, { reject: Function, success: Function }>()
type Response = { success: boolean, data?: any, message?: string }

type ServiceRequestOptions = {
    wait_result?: boolean,
    route?: string
}

export class TypescriptMicroservice {

    static framework: TypescriptMicroservice

    async active(target: any) {
        await this.active_local_service(target)
        await this.active_topic_subscriber(target)
        const on_ready_hooks = Reflect.getMetadata(ON_MICROSERVICE_READY, target) || []
        for (const method of on_ready_hooks) target[method]()
    }

    private rpc_topic = 'typescript-microservice-rpc-topic-' + v4()

    constructor(private transporter: Transporter) {

        process.on('exit', () => this.cleanup());
        process.on('SIGINT', () => this.cleanup());
        process.on('SIGUSR1', () => this.cleanup());
        process.on('SIGUSR2', () => this.cleanup());
    }

    async cleanup() {
        process.env.TSMS_DEBUG && console.log('Clean subscription ... ')
        this.transporter.deleteTopic(this.rpc_topic)
        this.transporter.deleteSubscription(this.rpc_topic)
    }

    static async init(transporter: Transporter) {
        const tsms = new this(transporter)
        await tsms.transporter.createTopic(tsms.rpc_topic)
        await tsms.transporter.listen(tsms.rpc_topic, async (msg) => {
            const response = Encoder.decode<Response>(msg.content)
            if (ResponseCallbackList.has(msg.id)) {
                const { success, reject } = ResponseCallbackList.get(msg.id)
                response.success ? success(response.data) : reject(response.message)
            }
        })
        this.framework = tsms
        return tsms
    }

    private get_topic_from(service: string, method: string) {
        return `${process.env.TS_MS_PREFIX ? process.env.TS_MS_PREFI + '|' : ''}${service}.${method}`
    }

    async publish(name: string, data: any, routing?: string) {
        await this.transporter.publish(name, Encoder.encode(data), { routing })
    }

    async rpc(config: {
        service: string,
        method: string,
        args: any,
        wait_result?: boolean,
        route?: string
    }) {
        const { method, args, service } = config
        const id = v4()
        const topic = this.get_topic_from(service, method)
        return await new Promise(async (success, reject) => {
            config.wait_result && ResponseCallbackList.set(id, { success, reject })
            await this.transporter.publish(topic, Encoder.encode(args), {
                id,
                reply_to: config.wait_result ? this.rpc_topic : undefined,
                ...config.route ? { routing: config.route } : {}
            })

            !config.wait_result && success()
        })
    }

    async link_remote_service<T>(service: string) {

        const call = (method: string | symbol | number, call_remote: boolean = true, options: ServiceRequestOptions = {}) => {
            if (typeof method != 'string' || ['then'].includes(method)) return null
            return call_remote ? (...args: any[]) => this.rpc({ args, wait_result: true, method, service }) : this.rpc({ args: null, wait_result: true, method, service })
        }

        return new Proxy({}, {
            get: (_, method) => {

                if (method == 'set') return (options: ServiceRequestOptions) => new Proxy({}, {
                    get: (_, method) => call(method, true, options)
                })

                if (method == 'fetch') return new Proxy({}, {
                    get: (_, method) => call(method, false)
                })

                return call(method)
            }
        }) as T & { set: (config: ServiceRequestOptions) => T, fetch: T }
    }

    private async active_local_service(target: any) {
        const service = Object.getPrototypeOf(target).constructor.name
        const methods = Reflect.getMetadata(ALLOW_FROM_REMOTE_METHODS, target) || [] as AllowFromRemoteOptions[]


        for (const { method, limit, routing } of methods) {
            process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Active local service [${service}.${method}]`, JSON.stringify({ limit, routing }, null, 2))
            const topic = this.get_topic_from(service, method)
            await this.transporter.createTopic(topic)
            await this.transporter.listen(topic, async msg => {
                try {
                    const args = Encoder.decode(msg.content)
                    process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Remote call ${service}.${method} args ${JSON.stringify(args)}`)
                    const data = args ? await (target[method] as Function).apply(target, args) : target[method]
                    if (msg.reply_to && msg.id) {
                        const response: Response = { success: true, data }
                        await this.transporter.publish(msg.reply_to, Encoder.encode(response), { id: msg.id })
                    }
                } catch (e) {
                    if (msg.reply_to && msg.id) {
                        const response: Response = { success: false, message: e }
                        await this.transporter.publish(msg.reply_to, Encoder.encode(response), { id: msg.id })
                    }
                }

            }, { limit, routing, fanout: false })
        }
    }

    private async active_topic_subscriber(target: any) {
        const methods = (Reflect.getMetadata(TOPIC_SUBSCRIBES, target) || []) as SubcribeTopicOptions[]
        for (const { method, limit, topic, fanout } of methods) {
            process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Active topic listener [${topic}] on [${Object.getPrototypeOf(target).constructor.name}.${method}]`)
            await this.transporter.createTopic(topic)
            await this.transporter.listen(topic, async msg => {
                try {
                    await (target[method] as Function)(Encoder.decode(msg.content))
                } catch (e) {
                }
            }, { limit, fanout })
        }
    }
}