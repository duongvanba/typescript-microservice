export class TypescriptMicroserviceError extends Error {

}

export class ConnectionNotFound extends TypescriptMicroserviceError {
    constructor(
        public readonly connection_name: any
    ) {
        super()
    }
}

export class MissingRemoteAction extends TypescriptMicroserviceError {
    constructor(
        public readonly service: any
    ) {
        super()
    }
}


export class RemoteServiceOffline extends TypescriptMicroserviceError {
    constructor(
        public readonly service_id: string,
        public readonly method: string,
        public readonly request_time: number,
        public readonly request_id: string,
        public readonly args: any[],
        public readonly route: string
    ) {
        super()
    }
} 