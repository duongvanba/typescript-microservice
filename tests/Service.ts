import { RPCService, AllowFromRemote, SubcribeTopic } from "../src";
import { AmqpTransporter } from "../src/transporters/AmqpTransporter";
import { TypescriptMicroservice } from "../src/TypescriptMicroservice";
import { Encoder } from "../src/Encoder";
import { GooglePubSubTransporter } from "../src/transporters/GooglePubSubTransporter";





@RPCService()
export class Service {


    @AllowFromRemote()
    public a = 1

    @AllowFromRemote({ limit: 1 })
    async sum(a: number, b: number) {
        console.log(`Caculate ${a} + ${b} = ${a + b}`)
        await new Promise(s => setTimeout(s, 5000))
        return a + b
    }


    @SubcribeTopic('ahihi')
    async listen(msg) {
        console.log(msg)
    }
}

if (process.argv[1] == __filename) {
    setImmediate(async () => {
        const tsms = await TypescriptMicroservice.init(new GooglePubSubTransporter())
        console.log("Active RPC service")
        new Service()
        console.log('Connect to mesage bus')
        console.log('Ready')
    })

} else {
    console.log('RPC service imported')
}

