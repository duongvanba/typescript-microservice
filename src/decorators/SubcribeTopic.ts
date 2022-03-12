import { TypescriptMicroservice } from "../TypescriptMicroservice";
import { SubcribeTopicOptions } from "../types";
import { DecoratorBuilder } from "../helpers/DecoratorBuilder";

export const [SubcribeTopic, listTopicListeners, activeTopicListeners] = DecoratorBuilder.createPropertyDecorator<SubcribeTopicOptions>(async function ({
    method,
    options
}) {
    await TypescriptMicroservice.listen(
        options,
        this[method]
    )
}) 