import { Service } from "./Service";
import { AmqpTransporter } from "../bin/AmqpTransporter";
import { TypescriptMicroservice } from "../src/TypescriptMicroservice";

setImmediate(async () => {
    console.log('Init connector')
    await TypescriptMicroservice.init({
        default: await AmqpTransporter.init()
    })


    console.log('Connect remote service')
    const service = await TypescriptMicroservice.link_remote_service<Service>(Service)


    await Promise.all(new Array(100).fill(0).map(async (_, index) => {
        try {
            const rs = await service.sum(index, 0)
            console.log({ rs })
        } catch (e) {
            console.log(e)
        }
    }))

})

