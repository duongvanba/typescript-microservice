import { DecoratorBuilder } from "../helpers/DecoratorBuilder";
import { ListenOptions } from '../Transporter'

export const [
    AllowFromRemote,
    listLocalRpcMethods,
    activeLocalServices
] = DecoratorBuilder.createPropertyDecorator<ListenOptions & { connection?: string }>()
