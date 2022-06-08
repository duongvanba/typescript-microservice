import { DecoratorBuilder } from "../helpers/DecoratorBuilder"
import { activeLocalServices } from "./AllowFromRemote"
import { activeTopicListeners } from "./SubcribeTopic"
import { activeWhenReadyHooks } from "./WhenMicroserviceReady"

export const Microservice = DecoratorBuilder.createClassDecorator(async target => {
    await activeTopicListeners(target)
    await activeLocalServices(target)
    await activeWhenReadyHooks(target)
})