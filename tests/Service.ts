import { sleep } from "../src/helpers/sleep";
import { AllowFromRemote, Microservice, SubcribeTopic, TypescriptMicroservice } from '../src'
import { AmqpTransporter } from "../bin/AmqpTransporter";

@Microservice()
export class Service { 

    @AllowFromRemote({ fanout: false })
    async sum(a: number, b: number) { 
        await sleep(60000)
        return a + b
    }


    @SubcribeTopic('ahihi')
    async listen(msg) {
        console.log(msg)
    }
}



if (process.argv[1] == __filename) {
    setImmediate(async () => {
        console.log('Init connector')
        await TypescriptMicroservice.init({
            default: await AmqpTransporter.init()
        })
        console.log("Active RPC service")
        new Service()
    })

} else {
    console.log('RPC service imported')
}

