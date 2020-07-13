import { RPCService, AllowFromRemote, SubcribeTopic, OnMicroserviceReady } from "../src";
import { TypescriptMicroservice } from "../src/TypescriptMicroservice";
import { GooglePubSubTransporter } from "../src/transporters/GooglePubSubTransporter";
import { get_request_time } from '../src/helpers/get_request_time'


const start = Date.now()

@RPCService()
export class Service {


    @AllowFromRemote()
    public a = 1

    @AllowFromRemote({ limit: 1, routing: () => `attributes.r = "1"`, fanout: false })
    async sum(a: number, b: number) {
        if (get_request_time(this) < start) return console.log('Old request')
        console.log('Request time : ' + (this as any).request_time)
        console.log(`Caculate ${a} + ${b}`)
        await new Promise(s => setTimeout(s, 5000))
        throw 'SOME error here'
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

