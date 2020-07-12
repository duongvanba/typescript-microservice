import { Transporter } from "./transporters/Transporter";
import { v4 } from 'uuid'
import { TOPIC_SUBSCRIBES, ALLOW_FROM_REMOTE_METHODS, ON_MICROSERVICE_READY } from "./symbol";
import { AllowFromRemoteOptions } from "./decorators/AllowFromRemote";
import { Encoder } from "./Encoder";
import { SubcribeTopicOptions } from "./decorators/SubcribeTopic";
import { OMIT_EVENTS } from "./const";
import { get_name } from "./helpers/get_name";
import { RemoteServiceResponse, RPCRequestOptions, RemoteServiceRequestOptions, RemoteServiceRouteRequestOptions, RemoteRPCService } from "./types";

const OnlineServices = new Map<string, number>()

const ResponseCallbackList = new Map<string, {
    reject: Function,
    success: Function,
    deadline?: number
    processing_by?: string
}>()


export class TypescriptMicroservice {

    private static framework: TypescriptMicroservice

    private static readonly service_session_id = v4()
    private static readonly rpc_topic = 'typescript-microservice-rpc-topic-' + TypescriptMicroservice.service_session_id


    constructor(private transporter: Transporter) {
        process.on('exit', () => this.cleanup('exit'));
        process.on('SIGINT', () => this.cleanup('SIGINT'));
        process.on('SIGUSR1', () => this.cleanup('SIGUSR1'));
        process.on('SIGUSR2', () => this.cleanup('SIGUSR2'));
    }

    private cleaning = false
    private tmp_subscrioptions = new Set<string>([TypescriptMicroservice.rpc_topic])
    async cleanup(event: string) {
        if (this.cleaning) return
        process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] App exit due to[${event}]event, cleaning tmp topics and subscriptions ...`)
        this.cleaning = true

        for (const subscription of this.tmp_subscrioptions) await this.transporter.deleteSubscription(subscription)
        await this.transporter.deleteTopic(TypescriptMicroservice.rpc_topic)
        process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Done`)
        process.exit()
    }

    static wrapper() {
        return (C: any) => class extends C {
            constructor(...props) {
                super(...props)
                if (!TypescriptMicroservice.framework) throw 'TYPESCRIPT_MICROSERVICE_FRAMWORK start incorrect'
                TypescriptMicroservice.framework.active(this)
            }
        }
    }

    static async init(transporter: Transporter) {

        if (this.framework) throw 'TYPESCRIPT_MICROSERVICE_FRAMWORK duplicate init'
        const tsms = new this(transporter)
        this.framework = tsms

        // Setup heartbeat
        await transporter.createTopic('heart-beat')
        transporter.listen('heart-beat', async msg => {
            const heartbeat = Encoder.decode<{ id: string }>(msg.content)
            OnlineServices.set(heartbeat.id, Date.now())
        }, { fanout: true })
        const heartbeat = () => transporter.publish('heart-beat', Encoder.encode({
            id: TypescriptMicroservice.service_session_id
        }))
        setInterval(heartbeat, 10000)

        // Listen response 
        await transporter.createTopic(TypescriptMicroservice.rpc_topic)
        await transporter.listen(TypescriptMicroservice.rpc_topic, async (msg) => {
            const response = Encoder.decode<RemoteServiceResponse>(msg.content)
            if (ResponseCallbackList.has(msg.id)) {
                if (response.confirm) return ResponseCallbackList.get(msg.id).processing_by = response.confirm
                const { success, reject } = ResponseCallbackList.get(msg.id)
                response.success ? success(response.data) : reject(response.message)
            }
        }, { fanout: false })

        // Monitor heatbeat
        this.rpc_monitor()

        // Heartbeat
        heartbeat()
        return tsms
    }

    private static async rpc_monitor() {
        while (true) {
            for (const [service_name, last_seen] of OnlineServices) {
                if (Date.now() - last_seen > 11000) OnlineServices.delete(service_name)
            }

            for (const [id, { reject, deadline, processing_by }] of ResponseCallbackList) {
                if (Date.now() > deadline) {
                    reject('RPC_TIMEOUT')
                    ResponseCallbackList.delete(id)
                }
                if (!OnlineServices.has(processing_by)) {
                    reject('SERVICE_OFFLINE')
                    ResponseCallbackList.delete(id)
                }
            }
            await new Promise(s => setTimeout(s, 5000))
        }
    }



    async publish(name: string, data: any, routing?: string) {
        await this.transporter.publish(get_name(name), Encoder.encode(data), {
            ...routing ? { routing } : {}
        })
    }

    async rpc(config: RPCRequestOptions) {
        const { method, args, service } = config
        const id = v4()
        const topic = get_name(service, method)

        return await new Promise(async (success, reject) => {

            config.wait_result && ResponseCallbackList.set(id, { success, reject, deadline: config.timeout && Date.now() + config.timeout })

            await this.transporter.publish(get_name(topic), Encoder.encode(args), {
                id,
                reply_to: TypescriptMicroservice.rpc_topic,
                routing: config.route
            })

            !config.wait_result && success()
        })
    }

    async link_remote_service<T>(service: any, exclude_methods: string[] = []) {

        const service_name = typeof service == 'string' ? service : (service.name || Object.getPrototypeOf(service).constructor.name)

        const call = (method: string | symbol | number, call_method: boolean = true, options: RemoteServiceRequestOptions = {}) => {
            if (typeof method != 'string' || [...OMIT_EVENTS, ...exclude_methods].includes(method)) return null
            return call_method ? (...args: any[]) => this.rpc({
                args,
                method,
                service: service_name,
                ...options
            }) : this.rpc({
                args: null,
                method,
                service: service_name,
                ...options
            })
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
        }) as RemoteRPCService<T>
    }



    async active(target: any) {
        await this.active_local_service(target)
        await this.active_topic_subscriber(target)
        const on_ready_hooks = Reflect.getMetadata(ON_MICROSERVICE_READY, target) || []
        for (const method of on_ready_hooks) target[method]()
    }

    private async active_local_service(target: any) {
        const service = Object.getPrototypeOf(target).constructor.name
        const methods = (Reflect.getMetadata(ALLOW_FROM_REMOTE_METHODS, target) || []) as AllowFromRemoteOptions[]


        for (const { method, limit, routing, fanout } of methods) {
            process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Active local service[${service}.${method}]`, JSON.stringify({ limit, routing }, null, 2))
            const topic = get_name(service, method)
            await this.transporter.createTopic(topic)
            await this.transporter.listen(`${process.env.TS_MS_PREFIX ? process.env.TS_MS_PREFIX + '|' : ''}${topic}`, async msg => {
                // Keep deadline
                this.transporter.publish(msg.reply_to, Encoder.encode({ confirm: TypescriptMicroservice.service_session_id } as RemoteServiceResponse), { id: msg.id })

                let response: RemoteServiceResponse

                try {
                    const args = Encoder.decode(msg.content)
                    process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Remote call ${service}.${method} args ${JSON.stringify(args)} `)
                    const data = args ? await (target[method] as Function).apply(Object.assign(target, { request_time: msg.created_time }), args) : target[method]
                    if (msg.reply_to && msg.id) response = { success: true, data }
                } catch (e) {
                    if (msg.reply_to && msg.id) response = { success: false, message: e }
                }

                response && await this.transporter.publish(msg.reply_to, Encoder.encode(response), { id: msg.id })

            }, { limit, routing, fanout: fanout ?? false })
        }
    }

    private async active_topic_subscriber(target: any) {
        const methods = (Reflect.getMetadata(TOPIC_SUBSCRIBES, target) || []) as SubcribeTopicOptions[]
        for (const { method, limit, topic, fanout } of methods) {
            process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Active topic listener[${topic}]on[${Object.getPrototypeOf(target).constructor.name}.${method}]`)
            await this.transporter.createTopic(get_name(topic))
            const subscription_name = await this.transporter.listen(get_name(topic), async msg => {
                try {
                    await (target[method] as Function).call(Object.assign(target, { request_time: msg.created_time }), Encoder.decode(msg.content))
                } catch (e) {
                }
            }, { limit, fanout: fanout ?? true })
            fanout && this.tmp_subscrioptions.add(subscription_name)
        }
    }
}