export const OMIT_EVENTS = [
    'then',
    'onModuleInit',
    'onApplicationBootstrap',
    'onModuleDestroy',
    'beforeApplicationShutdown',
    'onApplicationShutdown'
]

export const RPC_OFFLINE_TIME = Number(process.env.TSMS_RPC_OFFLINE_TIME || 10000)