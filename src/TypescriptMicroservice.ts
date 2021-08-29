
import { Transporter } from "./Transporter";
import { v4 } from 'uuid'
import { Encoder } from "./Encoder";
import { MAIN_SERVICE_CLASS, OMIT_EVENTS, RPC_OFFLINE_TIME } from "./const";
import { get_name } from "./helpers/get_name";
import { RPCRequestOptions, RemoteServiceRequestOptions, RemoteRPCService, RemoteServiceResponse } from "./types";
import { sleep } from "./helpers/sleep";
import { MissingDefaultTransporter, RemoteServiceNotFound, RemoteServiceOffline, TransporterNotFound } from "./errors";


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

    static async publish<T>(topic: string, data: T, connection: string = 'default') {
        this.transporters.get(connection)?.publish(
            topic,
            Buffer.from(JSON.stringify(data)),
            { connection })
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
        const transporter = TypescriptMicroservice.transporters.get(connection)
        if (!transporter) throw new TransporterNotFound(connection)

        return await new Promise<void>(async (success, reject) => {
            const data = Encoder.encode(args)
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
                reply_to: TypescriptMicroservice.rpc_topic
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

    private static get_service_name(service: any) {
        for (let target = service; target; target = Object.getPrototypeOf(target)) {
            if (target.prototype[MAIN_SERVICE_CLASS] == target) return target.name
        }
    }

    static async link_remote_service<T>(service: { new(...args: any[]): T }, exclude_methods: string[] = []) {

        const service_name = this.get_service_name(service)
        if (!service_name) throw new RemoteServiceNotFound(service_name)

        return new Proxy({}, {
            get: (_, method) => {

                if (typeof method != 'string' || [...OMIT_EVENTS, ...exclude_methods].includes(method)) return null

                if (method == 'set') return (options: RemoteServiceRequestOptions = {}) => new Proxy({}, {
                    get: (_, method) => (...args: any[]) => typeof method == 'string' && this.rpc({ args, method, service: service_name, wait_result: true, ...options })
                })

                return (...args: any[]) => typeof method == 'string' && this.rpc({ args, method, service: service_name, wait_result: true })
            }
        }) as RemoteRPCService<T>
    }

    static async init(transporters: { [name: string]: Transporter }) {

        if (!transporters.default) throw new MissingDefaultTransporter()


        for (const name in transporters) {
            const transporter = transporters[name]
            this.transporters.set(name, transporter)

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
                if (type == 'callback') {
                    args[callback.index](...callback.args)
                }

                ResponseCallbackList.get(msg.id).last_ping = Date.now()

            }, { fanout: false })
        }
    }

}
