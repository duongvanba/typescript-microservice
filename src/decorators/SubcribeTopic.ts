import { DecoratorBuilder } from "../helpers/DecoratorBuilder";
import { ListenOptions } from "../Transporter";

export const [
    SubcribeTopic,
    listTopicListeners,
    activeTopicListeners
] = DecoratorBuilder.createPropertyDecorator<ListenOptions & { topic: string, connection?: string }>()
