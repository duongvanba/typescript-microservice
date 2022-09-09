export class TypescriptMicroserviceError extends Error { }

export class RemoteServiceNotFound extends TypescriptMicroserviceError {
    constructor(
        public readonly service: any
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

export class MissingDefaultTransporter extends TypescriptMicroserviceError { }

export class TransporterNotFound extends TypescriptMicroserviceError {
    constructor(
        public readonly transporter_id: string
    ) {
        super()
    }
}


export class RemoteServiceOffline extends TypescriptMicroserviceError {
    constructor(
        public readonly service_id: string,
        public readonly method: string,
        public readonly request_time: number,
        public readonly waited_duration: number,
        public readonly args: any[],
    ) {
        super()
    }
} 