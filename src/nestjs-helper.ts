import { TypescriptMicroservice } from "./TypescriptMicroservice";

export const RemoteRPCService = (target: Function) => ({
    provide: target,
    useFactory: (tsms: TypescriptMicroservice) => tsms.link_remote_service(target.name)
})  