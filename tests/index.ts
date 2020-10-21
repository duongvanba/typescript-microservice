import { Service } from "./Service";
import { AmqpTransporter } from "../src/transporters/AmqpTransporter";
import { TypescriptMicroservice } from "../src/TypescriptMicroservice";
import { GooglePubSubTransporter } from "../src/transporters/GooglePubSubTransporter";

setImmediate(async () => {
    console.log('Init connector')
    const ms = await TypescriptMicroservice.init(await AmqpTransporter.init())


    console.log('Connect remote service')
    const service = await ms.link_remote_service<Service>(Service)


    await Promise.all(new Array(100).fill(0).map(async (_, index) => {
        try {
            const rs = await service.sum(index, 0)
            console.log({ rs })
        } catch (e) {
            console.log(e)
        }
    }))

})
