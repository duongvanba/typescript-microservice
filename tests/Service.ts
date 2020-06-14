import { RPCService, AllowFromRemote, SubcribeTopic, OnMicroserviceReady } from "../src";
import { AmqpTransporter } from "../src/transporters/AmqpTransporter";
import { TypescriptMicroservice } from "../src/TypescriptMicroservice";
import { Encoder } from "../src/Encoder";
import { GooglePubSubTransporter } from "../src/transporters/GooglePubSubTransporter";





@RPCService()
export class Service {


    @AllowFromRemote()
    public a = 1

    @AllowFromRemote({ limit: 1, routing: () => `attributes.id = "2"` })
    async sum(a: number, b: number) {
        console.log(`Caculate ${a} + ${b}`)
        await new Promise(s => setTimeout(s, 5000))
        // console.log(` = ${a + b}`)
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
        await TypescriptMicroservice.init(new GooglePubSubTransporter())
        console.log("Active RPC service")
        new Service()
    })

} else {
    console.log('RPC service imported')
}

