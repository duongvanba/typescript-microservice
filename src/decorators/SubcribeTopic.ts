import { Encoder } from "../Encoder";
import { get_name } from "../helpers/get_name";
import { ListenOptions } from "../Transporter";
import { TypescriptMicroservice } from "../TypescriptMicroservice";
import { D } from "./decorator";
import Queue from 'p-queue'
import { TransporterNotFound } from "../errors";

export type EventContext = {
    requested_time: number
}



const SubcribeTopicDecorator = D.createPropertyOrMethodDecorator<ListenOptions & { topic: string }>(async (target, method, {
    topic,
    connection = 'default',
    fanout,
    limit,
    concurrency
}) => {

    const transporter = TypescriptMicroservice.transporters.get(connection)
    if (!transporter) throw new TransporterNotFound(connection)


    const queue = new Queue(concurrency ? { concurrency } : {})

    const subscription_name = await transporter.listen(get_name(topic), async msg => {
        try {
            const ctx: EventContext = Object.assign(target, { requested_time: msg.created_time })
            await queue.add(() => (target[method] as Function).call(ctx, Encoder.decode(msg.content)))

        } catch (e) {
        }
    }, { limit, fanout: fanout ?? true })

    fanout && TypescriptMicroservice.tmp_subscrioptions.add(subscription_name)
})


export const listTopicSubcribers = SubcribeTopicDecorator[1]

export const SubcribeTopic = (topic: string, options: Omit<ListenOptions, 'topic'> = {}) => (
    target,
    method,
    descriptor
) => {
    SubcribeTopicDecorator[0]({ ...options, topic })(target, method, descriptor)
}