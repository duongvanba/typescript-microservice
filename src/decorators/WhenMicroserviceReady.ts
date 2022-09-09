import { DecoratorBuilder } from "../helpers/DecoratorBuilder";

export const [
    WhenMicroserviceReady,
    listenReadyHooks,
    activeWhenReadyHooks
] = DecoratorBuilder.createPropertyDecorator<{ connection?: string }>() 