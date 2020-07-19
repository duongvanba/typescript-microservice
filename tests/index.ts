import { Service } from "./Service";
import { AmqpTransporter } from "../src/transporters/AmqpTransporter";
import { TypescriptMicroservice } from "../src/TypescriptMicroservice";
import { GooglePubSubTransporter } from "../src/transporters/GooglePubSubTransporter";

setImmediate(async () => {
    console.log('Init connector')
    const ms = await TypescriptMicroservice.init(await AmqpTransporter.init())


    console.log('Connect remote service')
    const service = await ms.link_remote_service<Service>(Service)

    console.log(`Caculating 4 + 5 = ?`)
    const result = await service.set({
        on_ping: data => console.log(data)
    }).sum(4, 5)
    console.log(`Result = ${result}`)

})
