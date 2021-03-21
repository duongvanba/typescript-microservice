import { TypescriptMicroservice } from "..";
import { RPC_OFFLINE_TIME } from "../const";
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

export const [AllowFromRemote, listServiceActions] = D.createPropertyOrMethodDecorator<ListenOptions>(async (
    target,
    method,
    {
        connection = 'default',
        fanout,
        limit,
        route,
        concurrency
    }) => {

    const transporter = TypescriptMicroservice.transporters.get(connection)
    if (!transporter) throw `Typescript microservice error, can not find connection "${connection}"`
    const service = Object.getPrototypeOf(target).constructor.name
    const topic = get_name(service, method)
    const queue = new Queue({ concurrency })
    await transporter.createTopic(topic)

    await transporter.listen(topic, async (msg) => {

        const args = Encoder.decode(msg.content)

        if (!msg.reply_to) {
            const request_context: RequestContext = {
                requested_time: msg.created_time,
                is_old_request: msg.created_time < TypescriptMicroservice.started_time,
                microservice_ready: TypescriptMicroservice.started_time > 0
            }
            await queue.add(() => (target[method] as Function).apply(Object.assign(target, request_context), args))
            return
        }

        // Keep deadline
        const prevent_timeout = setInterval(() => transporter.publish(
            msg.reply_to,
            Encoder.encode({ type: 'ping' } as RemoteServiceResponse),
            { id: msg.id }
        ), RPC_OFFLINE_TIME)

        let response: RemoteServiceResponse

        // Process request
        try {
            process.env.TSMS_DEBUG && console.log(`[TSMS_DEBUG] Remote call ${service}.${method} args ${JSON.stringify(args)} `)

            const ctx = Object.assign(target, {
                requested_time: msg.created_time,
                started_time: TypescriptMicroservice.started_time,
                is_old_request: () => msg.created_time < TypescriptMicroservice.started_time,
                microservice_ready: () => TypescriptMicroservice.started_time > 0
            })

            const data = await (target[method] as Function).apply(ctx, args)

            if (msg.reply_to && msg.id) response = { type: 'response', data }
        } catch (e) {
            if (msg.reply_to && msg.id) response = { type: 'error', message: e }
        }

        clearInterval(prevent_timeout)
        await transporter.publish(msg.reply_to, Encoder.encode(response), { id: msg.id })

    }, {
        limit,
        route: typeof route == "function" ? await route() : route,
        fanout: fanout ?? false
    })




})