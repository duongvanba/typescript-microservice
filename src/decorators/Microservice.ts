import { DecoratorBuilder } from "../helpers/DecoratorBuilder"
import { TypescriptMicroservice } from "../TypescriptMicroservice"
import { listenReadyHooks } from "./WhenMicroserviceReady"



export const Microservice = DecoratorBuilder.createClassDecorator<{ connection_name?: string }>(async (target, { connection_name = 'default' } = {}) => {
    const microservice = await TypescriptMicroservice.get_connection(connection_name)
    await microservice.active_event_listeners(target)
    await microservice.active_local_services(target)
    await microservice.active_ready_hooks(target)
})