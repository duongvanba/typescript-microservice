import { AllowFromRemote, SubcribeTopic, OnMicroserviceReady, TypescriptMicroservice, AmqpTransporter } from "../src";
import { GooglePubSubTransporter } from "../src/transporters/GooglePubSubTransporter";
import { sleep } from "../src/helpers/sleep";



export class Service extends TypescriptMicroservice {


    @AllowFromRemote()
    public index = 1

    @AllowFromRemote({ fanout: false })
    async sum(a: number, b: number) {
        console.log(`New request ${this.index++}`)
        await sleep(60000)
        return a + b
    }


    @SubcribeTopic('ahihi')
    async listen(msg) {
        console.log(msg)
    }


    @OnMicroserviceReady()
    async onready() {
        console.log('Service inited')
    }
}



if (process.argv[1] == __filename) {
    setImmediate(async () => {
        console.log('Init connector')
        await TypescriptMicroservice.init(await AmqpTransporter.init())
        console.log("Active RPC service")
        new Service()
    })

} else {
    console.log('RPC service imported')
}

