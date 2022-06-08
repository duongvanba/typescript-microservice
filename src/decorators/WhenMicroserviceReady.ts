import { SubcribeTopicOptions } from "../types";
import { DecoratorBuilder } from "../helpers/DecoratorBuilder";

export const [WhenMicroserviceReady, listenReadyHooks, activeWhenReadyHooks] = DecoratorBuilder.createPropertyDecorator<SubcribeTopicOptions>(async function () {

}) 