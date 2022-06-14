import { TypescriptMicroservice } from ".."
import { SubcribeTopic } from "../decorators/SubcribeTopic"
import { SubcribeTopicOptions } from "../types"
import { finalize, Subject } from 'rxjs'


export const createMicroserviceEvent = <T>(options: SubcribeTopicOptions) => {


    const publish = (data?: T) => TypescriptMicroservice.publish(options.topic, data ?? {}, options.connection)
    const listen = (fn: (data: T) => any) => { TypescriptMicroservice.listen(options, fn) }
    const subscribe = () => SubcribeTopic(options)
    const stream = () => {
        const subject = new Subject<T>()
        const subcription = TypescriptMicroservice.listen(options, event => subject.next(event))
        return subject.pipe(
            finalize(() => subcription.unsubscribe())
        )
    }

    return {
        publish,
        listen,
        subscribe,
        stream
    }
}