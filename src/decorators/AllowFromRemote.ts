import { TypescriptMicroservice } from "..";
import { RPC_OFFLINE_TIME, MAIN_SERVICE_CLASS, RPC_HEARTBEAT_TIME } from "../const";
import { Encoder } from "../Encoder";
import { get_name } from "../helpers/get_name";
import { ListenOptions } from "../Transporter";
import { RemoteServiceResponse } from "../types";
import { D } from "./decorator";
import Queue from 'p-queue'

export type RequestContext = {
    requested_time: number
    is_old_request: boolean
    microservice_ready: boolean
}


export const [_, listServiceActions] = D.createPropertyOrMethodDecorator<ListenOptions>(async (
    target,
    method,
    {
        connection = 'default',
        fanout,
        limit,
        route,
        concurrency
    } = {}) => {

    const transporter = TypescriptMicroservice.transporters.get(connection)
    if (!transporter) throw `Typescript microservice error, can not find connection "${connection}"`

    const service = target[MAIN_SERVICE_CLASS].name
    const topic = get_name(service, method)
    const queue = new Queue(concurrency ? { concurrency } : {})

    await transporter.listen(topic, async (msg) => {

        const publish = (data: RemoteServiceResponse) => transporter.publish(
            msg.reply_to,
            Encoder.encode<RemoteServiceResponse>(data),
            { id: msg.id }
        )

        // Create callbackable argumenets 
        const args = (Encoder.decode(msg.content) as any[]).map((arg, index) => {
            if (typeof arg != 'function') return arg
            return (...args: any[]) => publish({
                type: 'callback',
                callback: { index, args }
            })
        })

        const wait_response = msg.reply_to && msg.id

        // Keep deadline
        const prevent_timeout = wait_response && setInterval(
            () => publish({ type: 'ping' }),
            RPC_HEARTBEAT_TIME
        )


        // Process request
        try {
            const ctx = Object.assign(target, {
                requested_time: msg.created_time,
                started_time: TypescriptMicroservice.started_time,
                is_old_request: () => msg.created_time < TypescriptMicroservice.started_time,
                microservice_ready: () => TypescriptMicroservice.started_time > 0
            })
            const data = await queue.add(() => (target[method] as Function).apply(ctx, args))
            wait_response && await publish({ type: 'response', data })
        } catch (e) {
            wait_response && await publish({ type: 'error', message: e })
        }

        // Send response back
        wait_response && clearInterval(prevent_timeout)

    }, {
        limit,
        route: typeof route == "function" ? await route() : route,
        fanout: fanout ?? false
    })

})


export const AllowFromRemote = (options?: ListenOptions) => (target: any, method: any, descriptor: any) => {
    target[MAIN_SERVICE_CLASS] = target.constructor
    _(options)(target, method, descriptor)
}