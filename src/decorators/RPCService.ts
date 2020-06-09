import { RpcServices } from "../db";
import { TypescriptMicroservice } from "../TypescriptMicroservice";


export const RPCService = () => (C: any) => {
    return class extends C {
        constructor(...props) {
            super(...props)
            if (!TypescriptMicroservice.framework) throw 'TYPESCRIPT_FRAMWORK_ERROR Cheking init method, maybe missing await'
            TypescriptMicroservice.framework.active(this)
        }
    } as any
}