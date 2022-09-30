
import { ListenOptions, PublishOptions, Transporter } from "./Transporter";
import { v4 } from 'uuid'
import { Encoder } from "./helpers/Encoder";
import { RPC_OFFLINE_TIME } from "./const";
import { MissingRemoteAction, RemoteServiceOffline } from "./errors";
import { listLocalRpcMethods } from "./decorators/AllowFromRemote";
import { DeepProxy } from './helpers/DeepProxy'
import { MicroserviceEvent, RemoteRPCService } from "./types";
import { listTopicListeners } from "./decorators/SubcribeTopic";
import { ReplaySubject, firstValueFrom } from "rxjs";
import { listenReadyHooks } from "./decorators/WhenMicroserviceReady";
import { filter, last } from 'rxjs/operators'
import { sleep } from "./helpers/sleep";


export class TypescriptMicroservice {

    static #connections = new ReplaySubject<TypescriptMicroservice>(500)

    static async get_connection(connection_name: string) {
        return await firstValueFrom(this.#connections.pipe(
            filter(c => c.connection_name == connection_name)
        ))
    }


    #ResponseCallbackList = new Map<string, {
        reject: Function,
        success: Function,
        request_time: number,
        timeout?: number
        args: any[],
        last_ping: number,
        route?: string,
        service: string
        method: string
    }>()

    #rpc_topic = `typescript-microservice-rpc-topic-${v4()}`

    constructor(
        private transporter: Transporter,
        private namespace: string = process.env.TS_MS_PREFIX || 'default',
        private connection_name: string = 'default'
    ) {
        setImmediate(async () => {
            await this.#active_responder_for_rpc()
            TypescriptMicroservice.#connections.next(this)
        })
    }

    #get_topic_name_in_namespace(topic: string, method?: string) {
        return `tsms-${this.namespace}|${topic}${method ? `.${method}` : ''}`
    }

    async #active_responder_for_rpc() {
        this.listen(this.#rpc_topic, { fanout: false }, async response => {
            if (response.type == 'response') {
                this.#ResponseCallbackList.get(response.request_id)?.success(response.data)
                this.#ResponseCallbackList.delete(response.request_id)
                return
            }
            if (response.type == 'error') {
                this.#ResponseCallbackList.get(response.request_id)?.reject(response.data)
                this.#ResponseCallbackList.delete(response.request_id)
                return
            }
            if (response.type == 'callback') {
                const fn = this.#ResponseCallbackList.get(response.request_id)?.args[response.callback.index]
                typeof fn == 'function' && fn(...response.callback.args)
                return
            }

            if (response.type == 'ping') {
                const req = this.#ResponseCallbackList.get(response.request_id)
                if (req) {
                    req.last_ping = Date.now()
                }
            }
        })

        setInterval(() => {
            for (const [request_id, { timeout, last_ping, reject, args, request_time, success, method, service, route }] of this.#ResponseCallbackList) {
                if (Date.now() - last_ping > timeout) {
                    reject(new RemoteServiceOffline(
                        service,
                        method,
                        request_time,
                        request_id,
                        args,
                        route
                    ))
                    this.#ResponseCallbackList.delete(request_id)
                }
            }
        }, RPC_OFFLINE_TIME)
    }

    async init(target) {
        this.#active_event_listeners(target)
        this.#active_local_services(target)
        this.#active_ready_hooks(target)
    }

    async #active_local_services(target: any) {
        for (const { method, options: { connection = 'default', ...options }, prototype } of listLocalRpcMethods(target)) {
            if (connection != this.connection_name) continue
            const service_name = prototype.constructor.name

            this.listen(`${service_name}.${method}`, options, async event => {


                if (event.type == 'request') {

                    const ping_intervel = setInterval(
                        () => this.publish(event.reply_to, { request_id: event.request_id, type: 'ping' }),
                        RPC_OFFLINE_TIME - 10000
                    )

                    const args = event.args.map((arg, index) => {
                        if (typeof arg != 'function') return arg
                        return (...args: any[]) => this.publish(
                            event.reply_to,
                            {
                                type: 'callback',
                                callback: {
                                    index,
                                    args
                                },
                                request_id: event.request_id
                            }
                        )
                    })


                    try {
                        const data = await target[method](...args)
                        await this.publish(event.reply_to, {
                            type: 'response',
                            data,
                            request_id: event.request_id
                        })

                    } catch (e) {
                        await this.publish(event.reply_to, {
                            type: 'error',
                            data: e,
                            message: e?.message,
                            request_id: event.request_id
                        })
                        console.error(e)
                    }

                    clearInterval(ping_intervel)
                }
            })

        }

    }


    async #active_event_listeners(target: any) {
        for (const { method, options: { topic, connection = 'default', ...options } } of listTopicListeners(target)) {
            if (connection != this.connection_name) continue
            this.listen(topic, options, async event => {
                if (event.type == 'event') {
                    try {
                        await target[method](event.data)
                    } catch (e) {
                        console.error(e)
                    }
                }
            })
        }
    }

    async #active_ready_hooks(target: any) {
        for (const { method, options: { connection = 'default' } } of listenReadyHooks(target)) {
            if (connection != this.connection_name) continue
            try {
                await target[method]()
            } catch (e) {
                console.error(e)
            }
        }
    }


    async publish(
        topic: string | undefined,
        data: MicroserviceEvent,
        { connection, ...options }: Partial<PublishOptions & { connection: string }> = {}
    ) {
        if (!topic) return
        return await this.transporter.publish(
            this.#get_topic_name_in_namespace(topic),
            Encoder.encode(data),
            options
        )
    }


    async listen(
        topic: string | undefined,
        { fanout, limit, route: get_route }: Partial<ListenOptions>,
        cb: (data: MicroserviceEvent) => any
    ) {
        const route = typeof get_route == 'function' ? await get_route() : get_route
        if (!topic) return
        const subscription = this.transporter.listen(
            this.#get_topic_name_in_namespace(topic),
            data => cb(Encoder.decode<MicroserviceEvent>(data.content)),
            {
                limit,
                fanout: fanout ?? true,
                route
            }
        )
        return { unsubscribe: () => subscription.unsubscribe() }
    }


    async rpc({
        args,
        method,
        service,
        connection = 'default',
        route,
        timeout = RPC_OFFLINE_TIME,
        wait_result
    }: { args: any[], method: string, service: string, connection: string, route: string, timeout: number, wait_result: boolean }) {

        const topic = `${service}.${method}`
        const request_id = v4()

        return await new Promise<void>(async (success, reject) => {

            if (wait_result == false) {
                this.publish(
                    topic,
                    { type: 'request', args, request_id },
                    { route, connection }
                )
                success()
                return
            }

            const request_time = Date.now()
            this.#ResponseCallbackList.set(request_id, {
                success,
                reject,
                timeout,
                request_time,
                args,
                last_ping: Date.now(),
                method,
                service,
                route
            })

            await this.publish(
                topic,
                { type: 'request', args, request_id, reply_to: this.#rpc_topic },
                {
                    route,
                    connection
                }
            )

        })
    }

    static link_remote_service<T>(factory: { new(...args: any[]): T }, connection_name: string = 'default') {

        const methods = listLocalRpcMethods(factory.prototype)
        if (methods.length == 0) throw new MissingRemoteAction(factory)
        const service = methods[0].prototype.constructor.name
        const rpc_methods = methods.map(m => m.method)
        const promise = this.get_connection(connection_name)

        return new Proxy({}, {
            get: (_, method: string) => new DeepProxy(
                ['wait_result', 'route', 'timeout', 'connection'],
                (method: string, options) => {
                    return rpc_methods.includes(method) ? async (...args) => {
                        const connection = await promise
                        return await connection.rpc({
                            args,
                            method,
                            service,
                            ...options,
                        })
                    } : undefined
                }
            ).nest()[method]
        }) as RemoteRPCService<T>
    }


}
