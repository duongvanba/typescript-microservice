import 'reflect-metadata'

import { ListenOptions } from "../transporters/Transporter";
import { ALLOW_FROM_REMOTE_METHODS } from '../symbol'


export type AllowFromRemoteOptions = ListenOptions & { method: string }

export const AllowFromRemote = (options: ListenOptions = {}) => (
    target: any,
    method: string
) => {
    const list: AllowFromRemoteOptions[] = Reflect.getMetadata(ALLOW_FROM_REMOTE_METHODS, target) || []
    list.push({ method, fanout: false, ...options })
    Reflect.defineMetadata(ALLOW_FROM_REMOTE_METHODS, list, target)
} 