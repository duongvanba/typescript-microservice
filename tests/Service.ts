import { AllowFromRemote, SubcribeTopic, OnMicroserviceReady, TypescriptMicroservice, AmqpTransporter } from "../src";
import { GooglePubSubTransporter } from "../src/transporters/GooglePubSubTransporter";
import { sleep } from "../src/helpers/sleep";

 

export class Service extends TypescriptMicroservice  {


    @AllowFromRemote()
    public a = 1

    @AllowFromRemote({ limit: 1, fanout: false })
    async sum(a: number, b: number) {
        console.log('New request')
        for (let i = 1; i <= 10; i++) {
            await sleep(1000)
            try {
                await this.pingback({ progress: i })
            } catch (e) {
                console.log(e)
            }
        }
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

