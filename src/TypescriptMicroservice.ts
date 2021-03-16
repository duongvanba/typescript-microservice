
import { Transporter } from "./Transporter";
import { v4 } from 'uuid'
import { Encoder } from "./Encoder";
import { OMIT_EVENTS, RPC_OFFLINE_TIME } from "./const";
import { get_name } from "./helpers/get_name";
import { RPCRequestOptions, RemoteServiceRequestOptions, RemoteRPCService, RemoteServiceResponse } from "./types";
import { sleep } from "./helpers/sleep";


const ResponseCallbackList = new Map<string, {
    reject: Function,
    success: Function,
    request_time: number,
    timeout?: number
    last_ping?: number,
    args: any[]
}>()

export class TypescriptMicroservice {

    static readonly service_session_id = v4()
    static readonly rpc_topic = 'typescript-microservice-rpc-topic-' + TypescriptMicroservice.service_session_id
    static readonly tmp_subscrioptions = new Set<string>([TypescriptMicroservice.rpc_topic])

    static readonly transporters = new Map<string, Transporter>()
    static readonly started_time = Number.MIN_SAFE_INTEGER

    static async rpc({
        args,
        method,
        service,
        connection = 'default',
        route,
        timeout = 1000,
        wait_result
    }: RPCRequestOptions) {
        const id = v4()
        const topic = get_name(service, method)
        const transporter = TypescriptMicroservice.transporters.get(connection)
        if (!transporter) throw `Typescript microservice error, can not find connection "${connection}"`

        return await new Promise<void>(async (success, reject) => {

            if (wait_result == false) {
                await transporter.publish(topic, Encoder.encode(args), {
                    id,
                    route
                })
                success()
                return
            }

            ResponseCallbackList.set(id, {
                success,
                reject,
                timeout,
                request_time: Date.now(),
                args: args.map(a => typeof a == 'function' ? a : null)
            })

            await transporter.publish(topic, Encoder.encode(args), {
                id,
                route,
                reply_to: TypescriptMicroservice.rpc_topic
            })

            // Monitor request
            const tid = setInterval(() => {
                if (!ResponseCallbackList.has(id)) return clearInterval(tid)
                const { request_time, last_ping } = ResponseCallbackList.get(id)
                if ((Date.now() - (last_ping || request_time)) > timeout) {
                    console.log(`[RPC offline] [${topic}]`)
                    return clearInterval(tid)
                }
            }, timeout)
        })
    }

    static async link_remote_service<T>(service: any, exclude_methods: string[] = []) {

        const service_name = typeof service == 'string' ? service : (service.name || Object.getPrototypeOf(service).constructor.name)

        return new Proxy({}, {
            get: (_, method) => {

                if (typeof method != 'string' || [...OMIT_EVENTS, ...exclude_methods].includes(method)) return null

                if (method == 'set') return (options: RemoteServiceRequestOptions = {}) => new Proxy({}, {
                    get: (_, method) => (...args: any[]) => typeof method == 'string' && this.rpc({ args, method, service: service_name, wait_result: true, ...options })
                })

                if (method == 'fetch') return (options: RemoteServiceRequestOptions = {}) => new Proxy({}, {
                    get: (_, method) => typeof method == 'string' && this.rpc({ args: null, method, service: service_name, ...options, wait_result: true, })
                })

                return (...args: any[]) => typeof method == 'string' && this.rpc({ args, method, service: service_name, wait_result: true })
            }
        }) as RemoteRPCService<T>
    }

    static async init(transporters: { [name: string]: Transporter }) {
        if (transporters.default) throw 'Typescript microservice error, missing default transporter'

        for (const name in transporters) {
            const transporter = transporters[name]
            this.transporters.set(name, transporter)

            await transporter.createTopic(TypescriptMicroservice.rpc_topic)

            transporter.listen(TypescriptMicroservice.rpc_topic, async (msg) => {

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
                if (type == 'callback') args[callback.index](...callback.args)
                ResponseCallbackList.get(msg.id).last_ping = Date.now()

            }, { fanout: false })
        }
    }

}
