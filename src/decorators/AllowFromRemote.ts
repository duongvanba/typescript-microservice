import { TypescriptMicroservice } from "..";
import { Encoder } from "../helpers/Encoder";
import { TopicUtils } from "../helpers/TopicUtils";
import { AllowFromRemoteOptions, RemoteServiceResponse } from "../types";
import { DecoratorBuilder } from "../helpers/DecoratorBuilder";

export const [AllowFromRemote, listLocalRpcMethods, activeLocalServices] = DecoratorBuilder.createPropertyDecorator<AllowFromRemoteOptions>(async function ({
    prototype,
    method,
    options: { connection, fanout, limit, route } = {} as AllowFromRemoteOptions
}) {
    const service_id = prototype.constructor.name
    const topic = TopicUtils.get_name(service_id, method)
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


        // Process request
        try {
            const data = await this[method](...args)
            wait_response && await publish({ type: 'response', data })
        } catch (e) {
            wait_response && await publish({ type: 'error', message: e })
            if (e instanceof Error) console.error(e)
        }

    }, {
        limit,
        route: typeof route == "function" ? await route() : route,
        fanout: fanout ?? false
    })

})
