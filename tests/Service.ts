import { AllowFromRemote, Microservice, sleep, SubcribeTopic, TypescriptMicroservice } from '../src'
import { AmqpTransporter } from "../bin/AmqpTransporter";

@Microservice()
export class Service {

    @AllowFromRemote( )
    async sum(a: number, b: number, fn: Function = (n: number) => { }) {
        console.log('New request', { a, b })
        await sleep(5000)
        return a + b
    }
    
    @AllowFromRemote( )
    check_online(){
        return true 
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

