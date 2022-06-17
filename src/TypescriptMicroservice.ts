
import { Message, Transporter } from "./Transporter";
import { v4 } from 'uuid'
import { Encoder } from "./Encoder";
import { RPC_OFFLINE_TIME } from "./const";
import { TopicUtils } from "./helpers/TopicUtils";
import { RPCRequestOptions, RemoteRPCService, RemoteServiceResponse, SubcribeTopicOptions } from "./types";
import { sleep } from "./helpers/sleep";
import { MissingRemoteAction, RemoteServiceOffline, TransporterNotFound } from "./errors";
import { listLocalRpcMethods } from "./decorators/AllowFromRemote";
import { Subject } from "rxjs";
import { finalize, map, mergeMap } from "rxjs/operators";
import { DeepProxy } from './helpers/DeepProxy'

const ResponseCallbackList = new Map<string, {
    reject: Function,
    success: Function,
    request_time: number,
    timeout?: number
    last_ping?: number,
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

    static async publish<T>(topic: string, data?: T, connection: string = 'default') {
        this.get_transporter(connection).publish(
            topic,
            Buffer.from(JSON.stringify(data ?? {}))
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
        const topic = TopicUtils.get_name(service, method)

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

    static listen({ concurrency, connection, fanout, limit, route, topic }: SubcribeTopicOptions) {

        const subject = new Subject<Message>()

        const subcription = this
            .get_transporter(connection)
            .listen(
                TopicUtils.get_name(topic),
                data => subject.next(data),
                { limit, fanout: fanout ?? true, concurrency, route }
            )

        return subject.pipe(
            map(msg => Encoder.decode(msg.content)),
            finalize(() => subcription.unsubscribe())
        )
    }

}
