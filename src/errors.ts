export class TypescriptMicroserviceError extends Error { }

export class RemoteServiceNotFound extends TypescriptMicroserviceError {
    constructor(
        public readonly service_name: string
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

