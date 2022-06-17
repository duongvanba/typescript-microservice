import { finalize, Subject } from "rxjs"
import { TypescriptMicroservice } from ".."
import { SubcribeTopic } from "../decorators/SubcribeTopic"
import { SubcribeTopicOptions } from "../types"


export const createMicroserviceEvent = <T>(options: SubcribeTopicOptions) => {


    const publish = (data?: T) => TypescriptMicroservice.publish(options.topic, data ?? {}, options.connection)
    const subscribe = () => SubcribeTopic(options)
    const stream = () => {
        const subject = new Subject<T>()
        const subcription = TypescriptMicroservice.listen<T>(options, event => subject.next(event))
        return subject.pipe(
            finalize(() => subcription.unsubscribe())
        )
    }


    return {
        publish,
        subscribe,
        stream
    }
}