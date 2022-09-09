
import { PublishOptions, Transporter } from "./Transporter";
import { v4 } from 'uuid'
import { Encoder } from "./helpers/Encoder";
import { RPC_OFFLINE_TIME } from "./const";
import { TopicUtils } from "./helpers/TopicUtils";
import { RPCRequestOptions, RemoteRPCService, RemoteServiceResponse, SubcribeTopicOptions } from "./types";
import { MissingRemoteAction, RemoteServiceOffline, TransporterNotFound } from "./errors";
import { listLocalRpcMethods } from "./decorators/AllowFromRemote";
import { DeepProxy } from './helpers/DeepProxy'

const ResponseCallbackList = new Map<string, {
    reject: Function,
    success: Function,
    request_time: number,
    timeout?: number
    args: any[]
}>()

const OptionsKeysList = ['wait_result', 'route', 'timeout', 'connection']

export class TypescriptMicroservice {

    static #rpc_topic = 'typescript-microservice-rpc-topic-' + v4()

    static #transporters = new Map<string, Transporter>()

    static get_transporter(name: string = 'default') {
        const transporter = this.#transporters.get(name)
        if (!transporter) throw new TransporterNotFound(name)
        return transporter
    }

    static async publish<T = {}>(topic: string, data: T = {} as T, { connection, ...options }: PublishOptions = {}) {
        this.get_transporter(connection).publish(
            TopicUtils.get_name(topic),
            Buffer.from(JSON.stringify(data ?? {})),
            options
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
        const topic = `${service}.${method}`

        return await new Promise<void>(async (success, reject) => {

            if (wait_result == false) {
                await this.publish(topic, args, { id, route, connection })
                success()
                return
            }

            const request_time = Date.now()
            ResponseCallbackList.set(id, {
                success,
                reject,
                timeout,
                request_time,
                args
            })

            await this.publish(topic, args, {
                id,
                route,
                reply_to: TypescriptMicroservice.#rpc_topic,
                connection,
                timeout
            })

            if (timeout) setTimeout(() => reject(new RemoteServiceOffline(service, method, request_time, Date.now() - request_time, args)), timeout)

        })
    }

    static async link_remote_service<T>(factory: { new(...args: any[]): T }, exclude_methods: string[] = []) {

        const methods = listLocalRpcMethods(factory.prototype)
        if (methods.length == 0) throw new MissingRemoteAction(factory)
        const service = methods[0].prototype.constructor.name
        const rpc_methods = methods.map(m => m.method)

        return new Proxy({}, {
            get: (_, method: string) => new DeepProxy(
                OptionsKeysList,
                (method: string, options) => {
                    return rpc_methods.includes(method) ? (...args) => this.rpc({
                        args,
                        method,
                        service,
                        ...options,
                    }) : undefined
                }
            ).nest()[method]
        }) as RemoteRPCService<T>
    }

    static async init(transporters: { default: Transporter, [name: string]: Transporter }) {

        for (const name in transporters) {
            const transporter = transporters[name]
            this.#transporters.set(name, transporter)
            transporter.listen(this.#rpc_topic, async msg => {

                if (!ResponseCallbackList.has(msg.id)) return


                const {
                    type,
                    data,
                    message,
                    callback
                } = Encoder.decode<RemoteServiceResponse>(msg.content)

                const { args, reject, success, timeout, request_time } = ResponseCallbackList.get(msg.id)

                if (timeout && Date.now() - request_time > timeout) return

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

            }, { fanout: false })
        }
    }

    static listen<T>({ connection, fanout, limit, route, topic }: SubcribeTopicOptions, cb: (data: T) => any) {


        const subscription = this
            .get_transporter(connection)
            .listen(
                TopicUtils.get_name(topic),
                data => cb(Encoder.decode<T>(data.content)),
                { limit, fanout: fanout ?? true, route }
            )

        return { unsubscribe: () => subscription.unsubscribe() }
    }

}
