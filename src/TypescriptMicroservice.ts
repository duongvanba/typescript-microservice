
import { Transporter } from "./Transporter";
import { v4 } from 'uuid'
import { Encoder } from "./Encoder";
import { OMIT_EVENTS, RPC_OFFLINE_TIME } from "./const";
import { get_name } from "./helpers/get_name";
import { RPCRequestOptions, RemoteServiceRequestOptions, RemoteRPCService, RemoteServiceResponse, SubcribeTopicOptions } from "./types";
import { sleep } from "./helpers/sleep";
import { RemoteServiceNotFound, RemoteServiceOffline, TransporterNotFound } from "./errors";
import { $$ServiceName } from "./MetadataKeyList";
import Queue from 'p-queue'

const ResponseCallbackList = new Map<string, {
    reject: Function,
    success: Function,
    request_time: number,
    timeout?: number
    last_ping?: number,
    args: any[]
}>()

export class TypescriptMicroservice {

    static #rpc_topic = 'typescript-microservice-rpc-topic-' + v4()

    static #transporters = new Map<string, Transporter>()

    static get_transporter(name: string = 'default') {
        const transporter = this.#transporters.get(name)
        if (!transporter) throw new TransporterNotFound(name)
        return transporter
    }

    static async publish<T>(topic: string, data: T, connection: string = 'default') {
        this.get_transporter(connection).publish(
            topic,
            Buffer.from(JSON.stringify(data))
        )
    }

    static async rpc({
        args,
        method,
        service,
        connection = 'default',
        route,
        timeout = RPC_OFFLINE_TIME,
        wait_result
    }: RPCRequestOptions) {

        const id = v4()
        const topic = get_name(service, method)

        return await new Promise<void>(async (success, reject) => {
            const data = Encoder.encode(args)

            const transporter = this.get_transporter(connection)

            if (wait_result == false) {
                await transporter.publish(topic, data, { id, route })
                success()
                return
            }

            ResponseCallbackList.set(id, {
                success,
                reject,
                timeout,
                request_time: Date.now(),
                args
            })

            await transporter.publish(topic, data, {
                id,
                route,
                reply_to: TypescriptMicroservice.#rpc_topic
            })

            // Monitor request
            setImmediate(async () => {
                await sleep(timeout + 1000)
                while (ResponseCallbackList.has(id)) {
                    const { request_time, last_ping, args } = ResponseCallbackList.get(id)
                    if ((Date.now() - (last_ping || request_time)) > timeout) {
                        reject(new RemoteServiceOffline(
                            service,
                            method,
                            request_time,
                            Date.now() - request_time,
                            args
                        ))
                        return
                    }
                    await sleep(timeout)
                }
            })
        })
    }

    static async link_remote_service<T>(service: { new(...args: any[]): T }, exclude_methods: string[] = []) {

        const service_name = Reflect.getMetadata($$ServiceName, service.prototype) as string

        return new Proxy({}, {
            get: (_, method) => {

                if (!service_name) throw new RemoteServiceNotFound(service)

                if (typeof method != 'string' || [...OMIT_EVENTS, ...exclude_methods].includes(method)) return null

                if (method == 'set') return (options: RemoteServiceRequestOptions = {}) => new Proxy({}, {
                    get: (_, method) => (...args: any[]) => typeof method == 'string' && this.rpc({
                        args,
                        method,
                        service: service_name,
                        wait_result: true,
                        ...options
                    })
                })

                return (...args: any[]) => typeof method == 'string' && this.rpc({ args, method, service: service_name, wait_result: true })
            }
        }) as RemoteRPCService<T>
    }

    static async init(transporters: { default: Transporter, [name: string]: Transporter }) {

        for (const name in transporters) {
            const transporter = transporters[name]
            this.#transporters.set(name, transporter)
            transporter.listen(this.#rpc_topic, async msg => {

                const {
                    type,
                    data,
                    message,
                    callback
                } = Encoder.decode<RemoteServiceResponse>(msg.content)


                if (!ResponseCallbackList.has(msg.id)) return

                const { args, reject, success } = ResponseCallbackList.get(msg.id)

                // Process done
                if (type == 'response' || type == 'error') {
                    type == 'response' && success(data)
                    type == 'error' && reject(message)
                    ResponseCallbackList.delete(msg.id)
                    return
                }

                // In progressing
                if (type == 'callback') {
                    args[callback.index](...callback.args)
                }

                ResponseCallbackList.get(msg.id).last_ping = Date.now()

            }, { fanout: false })
        }
    }

    static async listen({ concurrency, connection, fanout, limit, route, topic }: SubcribeTopicOptions, cb: Function) {
        const queue = new Queue(concurrency ? { concurrency } : {})
        return this.get_transporter(connection).listen(get_name(topic), async msg => {
            try {
                await queue.add(() => cb(Encoder.decode(msg.content)))
            } catch (e) { }
        }, { limit, fanout: fanout ?? true, concurrency, route })
    }


}
