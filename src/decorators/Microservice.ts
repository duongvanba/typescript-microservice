import { DecoratorBuilder } from "./DecoratorBuilder"

export const D = new DecoratorBuilder()
export const Microservice = D.getClassDecorator()