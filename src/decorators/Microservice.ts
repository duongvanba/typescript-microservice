import { DecoratorBuilder } from "../helpers/DecoratorBuilder"
import { activeLocalServices } from "./AllowFromRemote"
import { activeTopicListeners } from "./SubcribeTopic"

export const Microservice = DecoratorBuilder.createClassDecorator(async target => {
    await activeTopicListeners(target)
    await activeLocalServices(target)
})