import { RPCService, AllowFromRemote, SubcribeTopic, OnMicroserviceReady, RPCInfomation } from "../src";
import { TypescriptMicroservice } from "../src/TypescriptMicroservice";
import { GooglePubSubTransporter } from "../src/transporters/GooglePubSubTransporter";
import { sleep } from "../src/helpers/sleep";



@RPCService()
export class Service extends RPCInfomation {


    @AllowFromRemote()
    public a = 1

    @AllowFromRemote({ limit: 1, routing: () => `attributes.r = "1"`, fanout: false })
    async sum(a: number, b: number) {
        if (!this.microservice_ready || this.is_old_request()) return
        
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
        await TypescriptMicroservice.init(new GooglePubSubTransporter())
        console.log("Active RPC service")
        new Service()
    })

} else {
    console.log('RPC service imported')
}

