import { Service } from "./Service";
import { AmqpTransporter } from "../src/transporters/AmqpTransporter";
import { TypescriptMicroservice } from "../src/TypescriptMicroservice";
import { GooglePubSubTransporter } from "../src/transporters/GooglePubSubTransporter";

setImmediate(async () => {
    console.log('Start')
    const tsms = await TypescriptMicroservice.init(new GooglePubSubTransporter())
    console.log('Connect remote service')
    const service = await tsms.link_remote_service<Service>('Service')
    console.log('Request RPC')
    console.log(`1 + 2 = ${await service.sum(1, 2)}`)

})
