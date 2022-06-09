import { TypescriptMicroservice } from ".."
import { SubcribeTopic } from "../decorators/SubcribeTopic"
import { SubcribeTopicOptions } from "../types"



export const createMicroserviceEvent = <T>(options: SubcribeTopicOptions) => {


    const publish = (data?: T) => TypescriptMicroservice.publish(options.topic, data ?? {}, options.connection)
    const listen = (fn: (data: T) => any) => { TypescriptMicroservice.listen(options, fn) }
    const subscribe = () => SubcribeTopic(options)

    return {
        publish,
        listen,
        subscribe
    }
}