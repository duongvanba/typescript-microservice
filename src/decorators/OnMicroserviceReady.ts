
import { ON_MICROSERVICE_READY } from '../symbol'

export const OnMicroserviceReady = () => (
    target: any,
    method: string
) => {
    const methods: string[] = Reflect.getMetadata(ON_MICROSERVICE_READY, target) || []
    methods.push(method)
    Reflect.defineMetadata(ON_MICROSERVICE_READY, methods, target)
}
