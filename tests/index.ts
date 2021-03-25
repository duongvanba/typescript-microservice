import { Service } from "./Service";
import { AmqpTransporter } from "../bin/AmqpTransporter";
import { TypescriptMicroservice } from "../src/TypescriptMicroservice";
import { sleep } from "../src";



setImmediate(async () => {

    console.log('Init connector')
    await TypescriptMicroservice.init({
        default: await AmqpTransporter.init()
    })





    console.log('Connect remote service')
    const service = await TypescriptMicroservice.link_remote_service(Service)
    console.log(`Sending request`)

    let online = false
    while (true) {
        try {
            await service.set({ timeout: 1000 }).check_online()
            if (!online) {
                online = true
                console.log('Online')
            }
        } catch {
            if (online) {
                console.log('Offline')
                online = false
            }
        }
        await sleep(500)
    }

})

