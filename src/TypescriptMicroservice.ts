import { Transporter } from "./transporters/Transporter";
import { v4 } from 'uuid'
import { TOPIC_SUBSCRIBES, ALLOW_FROM_REMOTE_METHODS, ON_MICROSERVICE_READY } from "./symbol";
import { AllowFromRemoteOptions } from "./decorators/AllowFromRemote";
import { Encoder } from "./Encoder";
import { SubcribeTopicOptions } from "./decorators/SubcribeTopic";
import { OMIT_EVENTS, RPC_OFFLINE_TIME } from "./const";
import { get_name } from "./helpers/get_name";
import { RemoteServiceResponse, RPCRequestOptions, RemoteServiceRequestOptions, RemoteServiceRouteRequestOptions, RemoteRPCService } from "./types";
import { PingInterval } from "./helpers/ping_intervel";
import { sleep } from './helpers/sleep'


const ResponseCallbackList = new Map<string, {
    reject: Function,
    success: Function,
    requested_time: number,
    timeout?: number
    last_ping?: number,
    on_ping?: Function
}>()

const ServiceClasses = new Set<any>()


export class TypescriptMicroservice {

    private static transporter: Transporter
    private static tsms: TypescriptMicroservice

    is_old_request: () => boolean
    request_created_time: number
    pingback: (data: any) => Promise<any>
    microservice_ready() { this.started_time > 0 }
    started_time = -1

    private static readonly service_session_id = v4()
    private static readonly rpc_topic = 'typescript-microservice-rpc-topic-' + TypescriptMicroservice.service_session_id

    constructor() {
        this.active(this)
    }

    // constructor(private transporter: Transporter) {
    //     process.on('exit', () => this.cleanup('exit'));
    //     process.on('SIGINT', () => this.cleanup('SIGINT'));
    //     process.on('SIGUSR1', () => this.cleanup('SIGUSR1'));
    //     process.on('SIGUSR2', () => this.cleanup('SIGUSR2'));
    // }

    // // CleanupServiceClasses
    // private cleaning = false
    // private tmp_subscrioptions = new Set<string>([TypescriptMicroservice.rpc_topic])
    // private async cleanup(event: string) {
    //     if (this.cleaning) return
    //     process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] App exit due to[${event}]event, cleaning tmp topics and subscriptions ...`)
    //     this.cleaning = true

    //     for (const subscription of this.tmp_subscrioptions) await TypescriptMicroservice.transporter.deleteSubscription(subscription)
    //     await TypescriptMicroservice.transporter.deleteTopic(TypescriptMicroservice.rpc_topic)
    //     process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Done`)
    //     process.exit()
    // } 

    static async init(transporter: Transporter) {

        if (TypescriptMicroservice.transporter) throw 'TYPESCRIPT_MICROSERVICE_FRAMWORK duplicate init'
        TypescriptMicroservice.transporter = transporter

        // Listen response 
        await transporter.createTopic(TypescriptMicroservice.rpc_topic)
        await transporter.listen(TypescriptMicroservice.rpc_topic, async (msg) => {

            const response = Encoder.decode<RemoteServiceResponse>(msg.content)
            if (ResponseCallbackList.has(msg.id)) {
                const { on_ping } = ResponseCallbackList.get(msg.id)
                if (response.confirm != undefined) return ResponseCallbackList.get(msg.id).last_ping = Date.now()
                if (response.ping != undefined) return on_ping && on_ping(response.ping)
                const { success, reject } = ResponseCallbackList.get(msg.id)
                response.success != undefined && (
                    response.success ? success(response.data) : reject(response.message)
                )
            }
        }, { fanout: false })

        // Monitor heatbeat
        this.rpc_monitor()
        this.tsms = new this()
        return this.tsms

    }

    private static async rpc_monitor() {
        while (true) {

            for (const [id, { reject, timeout, requested_time, last_ping }] of ResponseCallbackList) {
                if (!last_ping && Date.now() - requested_time > RPC_OFFLINE_TIME + 3000) {
                    reject('RPC_OFFLINE')
                    ResponseCallbackList.delete(id)
                }

                if (Date.now() - requested_time > timeout) {
                    reject('RPC_TIMEOUT')
                    ResponseCallbackList.delete(id)
                }
            }
            await sleep(5000)
        }
    }



    protected async publish(name: string, data: any, routing?: string) {
        await TypescriptMicroservice.transporter.publish(get_name(name), Encoder.encode(data), {
            ...routing ? { routing } : {}
        })
    }

    protected async rpc(config: RPCRequestOptions) {
        const { method, args, service } = config
        const id = v4()
        const topic = get_name(service, method)

        return await new Promise(async (success, reject) => {

            if (config.wait_result == false) {
                await TypescriptMicroservice.transporter.publish(get_name(topic), Encoder.encode(args), {
                    id,
                    routing: config.route
                })
                success()
                return
            }

            ResponseCallbackList.set(id, {
                success,
                reject,
                timeout: config.timeout,
                requested_time: Date.now(),
                on_ping: config.on_ping
            })

            await TypescriptMicroservice.transporter.publish(get_name(topic), Encoder.encode(args), {
                id,
                routing: config.route,
                reply_to: TypescriptMicroservice.rpc_topic
            })
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

    private async active(target: any) {
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
            await TypescriptMicroservice.transporter.createTopic(topic)
            await TypescriptMicroservice.transporter.listen(`${process.env.TS_MS_PREFIX ? process.env.TS_MS_PREFIX + '|' : ''}${topic}`, async msg => {

                const args = Encoder.decode(msg.content)

                if (!msg.reply_to) {
                    if (!args) return
                    await (target[method] as Function).apply(Object.assign(target, {
                        request_time: msg.created_time,
                        pingback: () => { }
                    }), args)
                    return
                }

                // Keep deadline
                const prevent_timeout = setInterval(() => TypescriptMicroservice.transporter.publish(
                    msg.reply_to,
                    Encoder.encode({ confirm: '' } as RemoteServiceResponse),
                    { id: msg.id }
                ), RPC_OFFLINE_TIME)

                let response: RemoteServiceResponse

                try {
                    process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Remote call ${service}.${method} args ${JSON.stringify(args)} `)
                    const data = args ? await (target[method] as Function).apply(Object.assign(target, {
                        requested_time: msg.created_time,
                        pingback: data => TypescriptMicroservice.transporter.publish(
                            msg.reply_to,
                            Encoder.encode({ ping: data } as RemoteServiceResponse),
                            { id: msg.id }
                        ),
                        started_time: this.started_time,
                        is_old_request: () => msg.created_time < this.started_time,
                        microservice_ready: () => this.started_time > 0
                    }), args) : target[method]
                    if (msg.reply_to && msg.id) response = { success: true, data }
                } catch (e) {
                    if (msg.reply_to && msg.id) response = { success: false, message: e }
                }
                clearInterval(prevent_timeout)
                await TypescriptMicroservice.transporter.publish(msg.reply_to, Encoder.encode(response), { id: msg.id })

            }, { limit, routing: typeof routing == "function" ? await routing() : routing, fanout: fanout ?? false })
        }
    }

    private async active_topic_subscriber(target: any) {
        const methods = (Reflect.getMetadata(TOPIC_SUBSCRIBES, target) || []) as SubcribeTopicOptions[]
        for (const { method, limit, topic, fanout } of methods) {
            process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Active topic listener[${topic}]on[${Object.getPrototypeOf(target).constructor.name}.${method}]`)
            await TypescriptMicroservice.transporter.createTopic(get_name(topic))
            const subscription_name = await TypescriptMicroservice.transporter.listen(get_name(topic), async msg => {
                try {
                    await (target[method] as Function).call(Object.assign(target, { request_time: msg.created_time }), Encoder.decode(msg.content))
                } catch (e) {
                }
            }, { limit, fanout: fanout ?? true })
            // fanout && this.tmp_subscrioptions.add(subscription_name)
        }
    }

    static extend(target: any) {
        return class extends target {
            constructor(...args) {
                super(...args)
                if (!TypescriptMicroservice.tsms) {
                    console.error('TYPESCRIPT_MICROSERVICE did not inited')
                    throw new Error('TYPESCRIPT_MICROSERVICE did not inited')
                }
                TypescriptMicroservice.tsms.active(this)
            }
        } as any
    }
} 