import { TypescriptMicroservice } from ".."
import { SubcribeTopic } from "../decorators/SubcribeTopic"
import { SubcribeTopicOptions } from "../types"


export const createMicroserviceEvent = <T>(options: SubcribeTopicOptions) => {


    const publish = (data?: T) => TypescriptMicroservice.publish(options.topic, data ?? {}, options.connection)
    const subscribe = () => SubcribeTopic(options)
    const stream = () => TypescriptMicroservice.listen(options)

    return {
        publish,
        subscribe,
        stream
    }
}