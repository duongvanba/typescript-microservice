export const OMIT_EVENTS = [
    'then',
    'onModuleInit',
    'onApplicationBootstrap',
    'onModuleDestroy',
    'beforeApplicationShutdown',
    'onApplicationShutdown'
]

export const MAIN_SERVICE_CLASS = Symbol.for('MAIN_SERVICE_CLASS')

export const RPC_OFFLINE_TIME = 10000