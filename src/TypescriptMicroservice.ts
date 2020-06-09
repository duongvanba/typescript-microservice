import { Transporter } from "./transporters/Transporter";
import { v4 } from 'uuid'
import { TOPIC_SUBSCRIBES, ALLOW_FROM_REMOTE_METHODS, ON_MICROSERVICE_READY } from "./symbol";
import { AllowFromRemoteOptions } from "./decorators/AllowFromRemote";
import { Encoder } from "./Encoder";
import { SubcribeTopicOptions } from "./decorators/SubcribeTopic";
import { OMIT_EVENTS } from "./const";

const ResponseCallbackList = new Map<string, { reject: Function, success: Function }>()

type RemoteServiceResponse = { success: boolean, data?: any, message?: string }

type RemoteServiceRouteRequestOptions = { route?: string }

type RemoteServiceRequestOptions = RemoteServiceRouteRequestOptions & {
    wait_result?: boolean
}

type RPCRequestOptions = RemoteServiceRequestOptions & {
    service: string,
    method: string,
    args: any
}

export class TypescriptMicroservice {

    static framework: TypescriptMicroservice



    private rpc_topic = 'typescript-microservice-rpc-topic-' + v4()

    constructor(private transporter: Transporter) {
        process.on('exit', () => this.cleanup('exit'));
        process.on('SIGINT', () => this.cleanup('SIGINT'));
        process.on('SIGUSR1', () => this.cleanup('SIGUSR1'));
        process.on('SIGUSR2', () => this.cleanup('SIGUSR2'));
    }

    private cleaning = false
    private tmp_topics = new Set<string>([this.rpc_topic])
    private tmp_subscrioptions = new Set<string>([this.rpc_topic])

    async cleanup(event: string) {
        if (this.cleaning) return
        process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] App exit due to [${event}] event, cleaning tmp topics and subscriptions ...`)
        this.cleaning = true

        for (const subscription of this.tmp_subscrioptions) await this.transporter.deleteSubscription(subscription)
        for (const topic of this.tmp_topics) await this.transporter.deleteTopic(topic)
        process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Done`)
        process.exit()
    }

    static async init(transporter: Transporter) {
        const tsms = new this(transporter)

        // Listen response 
        await tsms.transporter.createTopic(tsms.rpc_topic)
        await tsms.transporter.listen(tsms.rpc_topic, async (msg) => {
            const response = Encoder.decode<RemoteServiceResponse>(msg.content)
            if (ResponseCallbackList.has(msg.id)) {
                const { success, reject } = ResponseCallbackList.get(msg.id)
                response.success ? success(response.data) : reject(response.message)
            }
        })
        this.framework = tsms
        return tsms
    }

    private get_name(service_or_topic: string, method?: string) {
        return `${process.env.TS_MS_PREFIX ? process.env.TS_MS_PREFIX + '|' : ''}${service_or_topic}${method ? `.${method}` : ''}`
    }

    async publish(name: string, data: any, routing?: string) {
        await this.transporter.publish(this.get_name(name), Encoder.encode(data), routing ? { routing } : {})
    }

    async rpc(config: RPCRequestOptions) {
        const { method, args, service } = config
        const id = v4()
        const topic = this.get_name(service, method)
        return await new Promise(async (success, reject) => {

            config.wait_result && ResponseCallbackList.set(id, { success, reject })

            await this.transporter.publish(this.get_name(topic), Encoder.encode(args), {
                id,
                ...config.wait_result ? { reply_to: this.rpc_topic } : {},
                ...config.route ? { routing: config.route } : {}
            })

            !config.wait_result && success()
        })
    }

    async link_remote_service<T>(service: string, exclude_methods: string[] = []) {

        const call = (method: string | symbol | number, call_method: boolean = true, options: RemoteServiceRequestOptions = {}) => {
            if (typeof method != 'string' || [...OMIT_EVENTS, ...exclude_methods].includes(method)) return null
            return call_method ? (...args: any[]) => this.rpc({ args, method, service, ...options }) : this.rpc({ args: null, method, service, ...options })
        }

        return new Proxy({}, {
            get: (_, method) => {

                if (method == 'set') return (options: RemoteServiceRequestOptions = {}) => new Proxy({}, {
                    get: (_, method) => call(method, true, { wait_result: true, ...options })
                })

                if (method == 'fetch') return (options: RemoteServiceRouteRequestOptions = {}) => new Proxy({}, {
                    get: (_, method) => call(method, false, { ...options, wait_result: true })
                })

                return call(method, true, { wait_result: true })
            }
        }) as T & { set: (config: RemoteServiceRequestOptions) => T, fetch: (config?: RemoteServiceRequestOptions) => T }
    }



    async active(target: any) {
        await this.active_local_service(target)
        await this.active_topic_subscriber(target)
        const on_ready_hooks = Reflect.getMetadata(ON_MICROSERVICE_READY, target) || []
        for (const method of on_ready_hooks) target[method]()
    }

    private async active_local_service(target: any) {
        const service = Object.getPrototypeOf(target).constructor.name
        const methods = Reflect.getMetadata(ALLOW_FROM_REMOTE_METHODS, target) || [] as AllowFromRemoteOptions[]


        for (const { method, limit, routing } of methods) {
            process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Active local service [${service}.${method}]`, JSON.stringify({ limit, routing }, null, 2))
            const topic = this.get_name(service, method)
            await this.transporter.createTopic(topic)
            await this.transporter.listen(`${process.env.TS_MS_PREFIX ? process.env.TS_MS_PREFIX + '|' : ''}${topic}`, async msg => {
                try {
                    const args = Encoder.decode(msg.content)
                    process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Remote call ${service}.${method} args ${JSON.stringify(args)}`)
                    const data = args ? await (target[method] as Function).apply(target, args) : target[method]
                    if (msg.reply_to && msg.id) {
                        const response: RemoteServiceResponse = { success: true, data }
                        await this.transporter.publish(msg.reply_to, Encoder.encode(response), { id: msg.id })
                    }
                } catch (e) {
                    if (msg.reply_to && msg.id) {
                        const response: RemoteServiceResponse = { success: false, message: e }
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
            await this.transporter.createTopic(this.get_name(topic))
            const subscription_name = await this.transporter.listen(this.get_name(topic), async msg => {
                try {
                    await (target[method] as Function)(Encoder.decode(msg.content))
                } catch (e) {
                }
            }, { limit, fanout })
            fanout && this.tmp_subscrioptions.add(subscription_name)
        }
    }
}