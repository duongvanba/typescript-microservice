import { TypescriptMicroservice } from "..";
import { RPC_HEARTBEAT_TIME } from "../const";
import { Encoder } from "../Encoder";
import { get_name } from "../helpers/get_name";
import { AllowFromRemoteOptions, RemoteServiceResponse } from "../types";
import Queue from 'p-queue'
import { DecoratorBuilder } from "../helpers/DecoratorBuilder";


export const [AllowFromRemote, listLocalRpcMethods, activeLocalServices] = DecoratorBuilder.createPropertyDecorator<AllowFromRemoteOptions>(async function ({
    prototype,
    method,
    options: { concurrency, connection, fanout, limit, route } = {} as AllowFromRemoteOptions 
}) { 
    console.log({prototype, method})
    const service_id = prototype.constructor.name
    const topic = get_name(service_id, method)
    const queue = new Queue(concurrency ? { concurrency } : {})
    const transporter = TypescriptMicroservice.get_transporter(connection)
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
            const data = await queue.add(() => this[method](args))
            wait_response && await publish({ type: 'response', data })
        } catch (e) {
            wait_response && await publish({ type: 'error', message: e })
            if (e instanceof Error) console.error(e)
        }

        // Send response back
        wait_response && clearInterval(prevent_timeout)

    }, {
        limit,
        route: typeof route == "function" ? await route() : route,
        fanout: fanout ?? false
    })

})
