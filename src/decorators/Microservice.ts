import { DecoratorBuilder } from "../helpers/DecoratorBuilder"
import { TypescriptMicroservice } from "../TypescriptMicroservice"



export const Microservice = DecoratorBuilder.createClassDecorator<{ connection_name?: string }>(async (target, { connection_name = 'default' } = {}) => {
    const microservice = await TypescriptMicroservice.get_connection(connection_name)
    await microservice.init(target)
})