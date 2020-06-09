import 'reflect-metadata'

import { ListenOptions } from "../transporters/Transporter";
import { TOPIC_SUBSCRIBES } from '../symbol'

export type SubcribeTopicOptions = ListenOptions & { method: string, topic: string }

export const SubcribeTopic = (topic: string, options: Partial<SubcribeTopicOptions> = {}) => (
    target: any,
    method: string
) => {
    const list: Array<ListenOptions & { method: string }> = Reflect.getMetadata(TOPIC_SUBSCRIBES, target) || []
    list.push({ method, topic, fanout: true, ...options })
    Reflect.defineMetadata(TOPIC_SUBSCRIBES, list, target)
}
