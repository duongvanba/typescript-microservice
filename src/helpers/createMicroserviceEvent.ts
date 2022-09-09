import { Subject } from "rxjs"
import { TypescriptMicroservice } from ".."
import { SubcribeTopic } from "../decorators/SubcribeTopic"
import { ListenOptions } from '../Transporter'

export const createMicroserviceEvent = <T>(topic: string, connection_name: string = 'default') => {

    const connection_online = TypescriptMicroservice.get_connection(connection_name)

    const publish = async (data?: T) => connection_online.then(c => c.publish(topic, {
        type: 'event',
        data
    }))

    const subscribe = (options: ListenOptions = {}) => SubcribeTopic({ ...options, topic, connection: connection_name })

    const stream = (options: ListenOptions = {}) => {
        const subject = new Subject<T>()

        connection_online.then(connection => connection.listen(topic, options, event => {
            if (event.type == 'event') {
                subject.next(event.data)
            }
        }))


        return subject
    }


    return {
        publish,
        subscribe,
        stream
    }
}