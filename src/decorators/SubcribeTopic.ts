import { Encoder } from "../Encoder";
import { get_name } from "../helpers/get_name";
import { ListenOptions } from "../Transporter";
import { TypescriptMicroservice } from "../TypescriptMicroservice";
import { D } from "./decorator";


export type EventContext = {
    requested_time: number
}



export const [SubcribeTopic, listTopicSubcribers] = D.createPropertyOrMethodDecorator<ListenOptions & { topic: string }>(async (target, method, {
    topic,
    connection = 'default',
    fanout,
    limit
}) => {

    const transporter = TypescriptMicroservice.transporters.get(connection)
    if (!transporter) throw `Typescript microservice error, can not find connection "${connection}"`

    await transporter.createTopic(get_name(topic))
    const subscription_name = await transporter.listen(get_name(topic), async msg => {
        try {
            const ctx: EventContext = { requested_time: msg.created_time }
            await (target[method] as Function).call(Object.assign(target, ctx), Encoder.decode(msg.content))
        } catch (e) {
        }
    }, { limit, fanout: fanout ?? true })

    fanout && TypescriptMicroservice.tmp_subscrioptions.add(subscription_name)
})