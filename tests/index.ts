import { Service } from "./Service";
import { AmqpTransporter } from "../src/transporters/AmqpTransporter";
import { TypescriptMicroservice } from "../src/TypescriptMicroservice";
import { GooglePubSubTransporter } from "../src/transporters/GooglePubSubTransporter";

setImmediate(async () => {
    console.log('Init connector')
    await TypescriptMicroservice.init(new GooglePubSubTransporter())


    console.log('Connect remote service')
    const service = await TypescriptMicroservice.framework.link_remote_service<Service>(Service)
    console.log('Request RPC')

    console.log('Test limit & queue')

    console.log('Send caculate')
    console.log(`1+2 = `, await service.sum(1, 2))

    // for (let i = 1; i <= 10; i++) {
    //     console.log('Send ' + i)
    //     await service.sum(i, 0)
    //     console.log('Received ' + i)
    //     console.log(i)
    // }

    // console.log(`Publish msg = 'ahihi'`)
    // await TypescriptMicroservice.framework.publish('ahihi', 'ahihi')
    // await TypescriptMicroservice.framework.publish('ahihi', 'ahihi')
    // await TypescriptMicroservice.framework.publish('ahihi', 'ahihi')
    // await TypescriptMicroservice.framework.publish('ahihi', 'ahihi')

})
