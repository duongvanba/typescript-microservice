import { TypescriptMicroservice } from "../TypescriptMicroservice";
import { $$ServiceName, $$SubcribeTopic } from "../MetadataKeyList";
import { SubcribeTopicOptions } from "../types";
import { D } from "./Microservice";

const [_] = D.createPropertyDecorator<SubcribeTopicOptions>(async function (list) {
    for (const { method, options } of list) {
        await TypescriptMicroservice.listen(
            options,
            this[method]
        )
    }
})


export const SubcribeTopic = (topic: string, options: Omit<SubcribeTopicOptions, 'topic'>) => _({ topic, ...options })